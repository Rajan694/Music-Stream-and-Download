"use client";

import { useEffect, useRef } from "react";
import { usePlayerStore } from "../../stores/player.store";
import { apiClient } from "../../lib/api";
import { recordGuestSong } from "../../lib/history";

export function PlayerProvider() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fetchedSuggestionsRef = useRef<string | null>(null);

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
