import { RecentSong } from "@music/shared";

const HISTORY_KEY = "music-stream:guest-history";
export const MAX_GUEST_HISTORY = 100;

export function readGuestHistory(): RecentSong[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentSong[];
  } catch {
    return [];
  }
}

export function recordGuestSong(
  song: Omit<RecentSong, "playedAt">,
): RecentSong[] {
  const history = readGuestHistory();
  const playedAt = new Date().toISOString();
  const entry: RecentSong = { ...song, playedAt };

  const deduped = history.filter((h) => h.videoId !== song.videoId);
  const next = [entry, ...deduped].slice(0, MAX_GUEST_HISTORY);

  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Storage full or unavailable — non-fatal for music playback.
  }
  return next;
}