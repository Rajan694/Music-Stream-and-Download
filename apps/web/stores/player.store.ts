import { create } from "zustand";
import { Video } from "@music/shared";

type RepeatMode = "off" | "all" | "one";

interface PlayerState {
  // Track State
  currentTrack: Video | null;
  queue: Video[];
  queueIndex: number;

  // Playback State
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  volume: number;
  isMuted: boolean;

  // Controls State
  repeatMode: RepeatMode;
  isShuffle: boolean;

  // Actions
  playTrack: (track: Video, queueList?: Video[]) => void;
  playNext: () => void;
  playPrevious: () => void;

  addToQueue: (track: Video) => void;
  playNextInQueue: (track: Video) => void;
  removeFromQueue: (index: number) => void;
  moveInQueue: (from: number, to: number) => void;
  playAt: (index: number) => void;
  clearQueue: () => void;

  setPlaying: (playing: boolean) => void;
  setDuration: (duration: number) => void;
  setCurrentTime: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;

  toggleRepeat: () => void;
  toggleShuffle: () => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  currentTrack: null,
  queue: [],
  queueIndex: -1,

  isPlaying: false,
  duration: 0,
  currentTime: 0,
  volume: 1.0,
  isMuted: false,

  repeatMode: "off",
  isShuffle: false,

  playTrack: (track, queueList) => {
    set((state) => {
      const q = queueList || state.queue;
      const index = q.findIndex((t) => t.id === track.id);
      return {
        currentTrack: track,
        queue: q,
        queueIndex: index >= 0 ? index : state.queueIndex,
        isPlaying: true, // Auto-play when explicitly played
      };
    });
  },

  playNext: () =>
    set((state) => {
      if (state.repeatMode === "one" && state.currentTrack) {
        // repeat-one means we don't change track, just reset time
        // (Audio element will handle the actual loop, but if manually triggered we could dispatch seek)
        return { currentTime: 0, isPlaying: true };
      }

      if (state.queue.length === 0) return state;

      let nextIndex = state.queueIndex + 1;
      if (nextIndex >= state.queue.length) {
        if (state.repeatMode === "all") {
          nextIndex = 0;
        } else {
          // End of queue
          return { isPlaying: false, currentTrack: null, queueIndex: -1 };
        }
      }

      return {
        currentTrack: state.queue[nextIndex],
        queueIndex: nextIndex,
        isPlaying: true,
      };
    }),

  playPrevious: () =>
    set((state) => {
      // If we're deep into a song, restart it instead of going back
      if (state.currentTime > 3) {
        return { currentTime: 0, isPlaying: true }; // Audio player will watch this
      }

      if (state.queue.length === 0) return state;

      let prevIndex = state.queueIndex - 1;
      if (prevIndex < 0) {
        if (state.repeatMode === "all") {
          prevIndex = state.queue.length - 1;
        } else {
          prevIndex = 0; // Stick to first song
        }
      }

      return {
        currentTrack: state.queue[prevIndex],
        queueIndex: prevIndex,
        isPlaying: true,
      };
    }),

  addToQueue: (track) =>
    set((state) => ({
      queue: [...state.queue, track],
    })),

  /** Insert directly after the current track rather than at the end. */
  playNextInQueue: (track) =>
    set((state) => {
      const queue = [...state.queue];
      const at = state.queueIndex >= 0 ? state.queueIndex + 1 : queue.length;
      queue.splice(at, 0, track);
      return { queue };
    }),

  /**
   * Reorder by drag. The playing track must keep pointing at itself, so the
   * index is recomputed from where that entry landed rather than patched.
   */
  moveInQueue: (from, to) =>
    set((state) => {
      if (from === to) return state;
      const queue = [...state.queue];
      if (from < 0 || from >= queue.length || to < 0 || to >= queue.length)
        return state;

      const current = state.queue[state.queueIndex];
      const [moved] = queue.splice(from, 1);
      queue.splice(to, 0, moved);

      const queueIndex = current
        ? queue.findIndex((t) => t.id === current.id)
        : state.queueIndex;
      return { queue, queueIndex };
    }),

  playAt: (index) =>
    set((state) => {
      if (index < 0 || index >= state.queue.length) return state;
      return {
        currentTrack: state.queue[index],
        queueIndex: index,
        isPlaying: true,
      };
    }),

  removeFromQueue: (index) =>
    set((state) => {
      const queue = [...state.queue];
      if (index < 0 || index >= queue.length) return state;
      queue.splice(index, 1);

      // Keep queueIndex pointing at the track that is actually playing.
      // Removing the current entry leaves playback running but detached from the
      // queue, so the index moves to -1 rather than silently addressing whichever
      // track shifted into that slot.
      let queueIndex = state.queueIndex;
      if (index < state.queueIndex) queueIndex--;
      else if (index === state.queueIndex) queueIndex = -1;

      return { queue, queueIndex };
    }),

  clearQueue: () => set({ queue: [], queueIndex: -1 }),

  setPlaying: (playing) => set({ isPlaying: playing }),
  setDuration: (duration) => set({ duration }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setVolume: (volume) => set({ volume }),
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),

  toggleRepeat: () =>
    set((state) => {
      const map: Record<RepeatMode, RepeatMode> = {
        off: "all",
        all: "one",
        one: "off",
      };
      return { repeatMode: map[state.repeatMode] };
    }),

  toggleShuffle: () => set((state) => ({ isShuffle: !state.isShuffle })), // Shuffle algorithm logic needed eventually
}));
