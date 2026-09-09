import { useEffect, useRef } from "react";
import { usePlayerStore } from "../../stores/player.store";
import { usePreferencesStore } from "../../stores/preferences.store";
import { recordGuestSong } from "../../lib/history";

export function PlayerProvider() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prefetchedStreamRef = useRef<string | null>(null);
  const streamQuality = usePreferencesStore((s) => s.streamQuality);

  const {
    currentTrack,
    isPlaying,
    volume,
    isMuted,
    repeatMode,
    pendingSeek,
    playNext,
    setCurrentTime,
    setDuration,
    setPlaying,
  } = usePlayerStore();

  const API_URL =
    import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1";

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

  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
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

  // Pending seek
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || pendingSeek == null) return;
    const total = Number.isFinite(audio.duration)
      ? audio.duration
      : currentTrack?.duration ?? 0;
    if (total > 0)
      audio.currentTime = Math.min(Math.max(0, pendingSeek), total);
    usePlayerStore.setState({ pendingSeek: null });
  }, [pendingSeek, currentTrack]);

  // Prefetch next track stream
  useEffect(() => {
    if (repeatMode === "one") return;

    const { queue, queueIndex } = usePlayerStore.getState();
    const next = queue[queueIndex + 1];
    if (!next) return;
    if (prefetchedStreamRef.current === next.id + ":" + streamQuality) return;
    prefetchedStreamRef.current = next.id + ":" + streamQuality;

    void fetch(
      `${API_URL}/media/videos/${next.id}/stream?quality=${streamQuality}`,
      { headers: { Range: "bytes=0-1" }, cache: "no-store" },
    ).catch(() => {
      prefetchedStreamRef.current = null;
    });
  }, [repeatMode, streamQuality, API_URL]);

  // Swap audio source
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    const { isPlaying: playing } =
      usePlayerStore.getState();

    const targetSrc = `${API_URL}/media/videos/${currentTrack.id}/stream?quality=${streamQuality}`;

    if (
      audio.src &&
      audio.src.includes(`/media/videos/${currentTrack.id}/stream`)
    ) {
      const currentUrl = new URL(audio.src, window.location.origin);
      if (currentUrl.searchParams.get("quality") === streamQuality) {
        return;
      }

      const currentPos = audio.currentTime;
      const wasPlaying = !audio.paused;

      audio.src = targetSrc;

      const onLoadedMetaData = () => {
        audio.currentTime = currentPos;
        if (wasPlaying) {
          audio.play().catch((e) => console.error("Auto-play prevented", e));
        }
        audio.removeEventListener("loadedmetadata", onLoadedMetaData);
      };
      audio.addEventListener("loadedmetadata", onLoadedMetaData);

      return;
    }

    audio.src = targetSrc;
    if (playing) {
      audio.play().catch((e) => console.error("Auto-play prevented", e));
    }
  }, [currentTrack, streamQuality, API_URL]);

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

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = isMuted;
  }, [volume, isMuted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.loop = repeatMode === "one";
  }, [repeatMode]);

  return null;
}
