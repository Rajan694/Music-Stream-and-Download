"use client";

import { useEffect, useRef } from "react";
import { usePlayerStore } from "../../stores/player.store";
import { apiClient } from "../../lib/api";
import { recordGuestSong } from "../../lib/history";

export function PlayerProvider() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fetchedSuggestionsRef = useRef<string | null>(null);
  const prefetchedStreamRef = useRef<string | null>(null);

  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    repeatMode,
    queue,
    queueIndex,
    playNext,
    setCurrentTime,
    setDuration,
    setPlaying,
    addToQueue,
  } = usePlayerStore();

  const API_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";

  // Record to guest history (§23) when a new track is played.
  useEffect(() => {
    if (currentTrack) {
      recordGuestSong({
        videoId: currentTrack.id,
        title: currentTrack.title,
        uploaderName: currentTrack.uploaderName,
        thumbnailUrl: currentTrack.thumbnails?.[0]?.url,
        duration: currentTrack.duration,
      });
    }
  }, [currentTrack]);

  // Mount/Unmount
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = "anonymous"; // Important for proxy
    audioRef.current = audio;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => playNext();
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    };
  }, [playNext, setCurrentTime, setDuration, setPlaying]);

  // Auto-next prefetching
  useEffect(() => {
    if (
      currentTrack &&
      duration > 0 &&
      currentTime > Math.max(0, duration - 30) &&
      fetchedSuggestionsRef.current !== currentTrack.id
    ) {
      // Only prefetch if we are at the end of the queue and repeat isn't "one"
      if (queueIndex >= queue.length - 1 && repeatMode !== "one") {
        fetchedSuggestionsRef.current = currentTrack.id;
        apiClient
          .getSuggestions(currentTrack.id)
          .then((suggestions) => {
            if (suggestions && suggestions.length > 0) {
              // Add the top suggestion to queue
              // First get full video to resolve formats via provider (could map summary but full is safer)
              apiClient
                .getVideo(suggestions[0].id)
                .then((video) => {
                  addToQueue(video);
                })
                .catch(console.error);
            }
          })
          .catch(console.error);
      }
    }
  }, [
    currentTime,
    duration,
    currentTrack,
    queue.length,
    queueIndex,
    repeatMode,
    addToQueue,
  ]);

  // Warm the next track's stream URL as soon as the current one starts, so
  // advancing the queue does not pay the provider round trip (seconds, since a
  // cold resolve spawns yt-dlp).
  //
  // This has to go through the stream route: `resolveStreamUrl` keys on
  // `stream:<id>:<quality>` and asks the provider chain directly, so warming
  // `video:<id>` with `getVideo` would leave the streaming path just as cold.
  // A two-byte range is enough — the server resolves and caches before it
  // relays anything.
  useEffect(() => {
    if (repeatMode === "one") return;

    const next = queue[queueIndex + 1];
    if (!next || prefetchedStreamRef.current === next.id) return;
    prefetchedStreamRef.current = next.id;

    // Deliberately not aborted on cleanup: the handler resolves and caches even
    // if the client goes away, so letting an in-flight warm finish is the point.
    void fetch(`${API_URL}/media/videos/${next.id}/stream?quality=high`, {
      headers: { Range: "bytes=0-1" },
      cache: "no-store",
    }).catch(() => {
      // A failed warm just means the next track resolves on demand.
      prefetchedStreamRef.current = null;
    });
  }, [queue, queueIndex, repeatMode, API_URL]);

  // Track change
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    // Reset fetched cache for new track
    if (fetchedSuggestionsRef.current !== currentTrack.id && currentTime < 5) {
      fetchedSuggestionsRef.current = null;
    }

    if (
      audio.src &&
      audio.src.includes(`/media/videos/${currentTrack.id}/stream`)
    )
      return;

    audio.src = `${API_URL}/media/videos/${currentTrack.id}/stream?quality=high`;
    if (isPlaying) {
      audio.play().catch((e) => console.error("Auto-play prevented", e));
    }
  }, [currentTrack, API_URL]);

  // Play/Pause change
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;

    if (isPlaying && audio.paused) {
      audio.play().catch((e) => {
        console.error("Playback failed", e);
        setPlaying(false);
      });
    } else if (!isPlaying && !audio.paused) {
      audio.pause();
    }
  }, [isPlaying, setPlaying]);

  // Volume & Mute
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = isMuted;
  }, [volume, isMuted]);

  // Repeat Mode
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.loop = repeatMode === "one";
  }, [repeatMode]);

  return null;
}
