import { create } from "zustand";

interface UIState {
  lastSearchQuery: string;
  setLastSearchQuery: (q: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  lastSearchQuery: "",
  setLastSearchQuery: (q) => set({ lastSearchQuery: q }),
}));
