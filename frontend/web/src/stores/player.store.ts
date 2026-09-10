import { create } from "zustand";
import { Track } from "@music/shared";
import { apiClient } from "../lib/api";

type RepeatMode = "off" | "all" | "one";

let radioGen = 0;

interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  volume: number;
  isMuted: boolean;
  repeatMode: RepeatMode;
  autoplay: boolean;
  isLoadingNext: boolean;
  pendingSeek: number | null;
  radioSeed: string | null;

  playTrack: (track: Track, queueList?: Track[]) => void;
  playNext: () => void;
  next: () => Promise<void>;
  playPrevious: () => void;
  addToQueue: (track: Track) => void;
  playNextInQueue: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  moveInQueue: (from: number, to: number) => void;
  playAt: (index: number) => void;
  clearQueue: () => void;
  setPlaying: (playing: boolean) => void;
  setDuration: (duration: number) => void;
  setCurrentTime: (time: number) => void;
  seekTo: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleRepeat: () => void;
  toggleAutoplay: () => void;
  hydrateTrack: (id: string, patch: Partial<Track>) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  duration: 0,
  currentTime: 0,
  volume: 1.0,
  isMuted: false,
  repeatMode: "off",
  autoplay: true,
  isLoadingNext: false,
  pendingSeek: null,
  radioSeed: null,

  playTrack: (track, queueList) => {
    if (queueList) {
      const index = queueList.findIndex((t) => t.id === track.id);
      set({
        currentTrack: track,
        queue: queueList,
        queueIndex: index >= 0 ? index : 0,
        isPlaying: true,
        currentTime: 0,
        duration: 0,
        radioSeed: null,
      });
      return;
    }

    const gen = ++radioGen;
    set({
      currentTrack: track,
      queue: [track],
      queueIndex: 0,
      isPlaying: true,
      radioSeed: track.id,
      currentTime: 0,
      duration: 0,
    });
    void (async () => {
      try {
        const suggestions = await apiClient.getSuggestions(track.id);
        if (gen !== radioGen) return;
        set((st) => ({
          queue: [
            ...st.queue,
            ...suggestions.filter((x) => x.id !== track.id),
          ],
        }));
      } catch {
        /* radio unavailable; manual queue still works */
      }
    })();
  },

  playNext: () => {
    get().next();
  },

  next: async () => {
    const s = get();
    if (s.repeatMode === "one") {
      set({ currentTime: 0, isPlaying: true });
      return;
    }

    if (s.queueIndex + 1 < s.queue.length) {
      get().playAt(s.queueIndex + 1);
      return;
    }
    if (s.repeatMode === "all" && s.queue.length) {
      get().playAt(0);
      return;
    }
    if (!s.autoplay || !s.currentTrack) {
      set({ isPlaying: false });
      return;
    }

    set({ isLoadingNext: true });
    const gen = ++radioGen;
    try {
      const more = await apiClient.getSuggestions(s.currentTrack.id);
      if (gen !== radioGen) return;
      const seen = new Set(get().queue.map((t) => t.id));
      const fresh = more.filter((t) => !seen.has(t.id));
      if (!fresh.length) {
        set({ isPlaying: false });
        return;
      }
      set((st) => ({ queue: [...st.queue, ...fresh] }));
      get().playAt(get().queueIndex + 1);
    } catch {
      set({ isPlaying: false });
    } finally {
      set({ isLoadingNext: false });
    }
  },

  playPrevious: () =>
    set((state) => {
      if (state.currentTime > 3) {
        return { currentTime: 0, isPlaying: true };
      }
      if (state.queue.length === 0) return state;

      let prevIndex = state.queueIndex - 1;
      if (prevIndex < 0) {
        if (state.repeatMode === "all") {
          prevIndex = state.queue.length - 1;
        } else {
          prevIndex = 0;
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

  playNextInQueue: (track) =>
    set((state) => {
      const queue = [...state.queue];
      const at = state.queueIndex >= 0 ? state.queueIndex + 1 : queue.length;
      queue.splice(at, 0, track);
      return { queue };
    }),

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
        currentTime: 0,
        duration: 0,
      };
    }),

  removeFromQueue: (index) =>
    set((state) => {
      const queue = [...state.queue];
      if (index < 0 || index >= queue.length) return state;
      queue.splice(index, 1);

      let queueIndex = state.queueIndex;
      if (index < state.queueIndex) {
        queueIndex--;
      } else if (index === state.queueIndex) {
        if (queue.length === 0) {
          return { queue, queueIndex: -1, currentTrack: null, isPlaying: false };
        }
        queueIndex = Math.min(queueIndex, queue.length - 1);
        return {
          queue,
          queueIndex,
          currentTrack: queue[queueIndex],
          isPlaying: true,
        };
      }

      return { queue, queueIndex };
    }),

  clearQueue: () =>
    set({ queue: [], queueIndex: -1, currentTrack: null, isPlaying: false }),

  setPlaying: (playing) => set({ isPlaying: playing }),
  setDuration: (duration) => set({ duration }),
  setCurrentTime: (time) => set({ currentTime: time }),
  seekTo: (seconds) => set({ pendingSeek: seconds, currentTime: seconds }),
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

  toggleAutoplay: () => set((state) => ({ autoplay: !state.autoplay })),

  hydrateTrack: (id, patch) =>
    set((state) => {
      const update = (t: Track) =>
        t.id === id ? { ...t, ...patch } : t;
      return {
        currentTrack: state.currentTrack?.id === id
          ? update(state.currentTrack)
          : state.currentTrack,
        queue: state.queue.map(update),
      };
    }),
}));
