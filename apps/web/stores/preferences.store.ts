import { create } from "zustand";
import type { UserSettings } from "@music/shared";
import { apiClient } from "../lib/api";
import {
  readPreferences,
  StoredPreferences,
  writePreferences,
} from "../lib/preferences";
import { useAuthStore } from "./auth.store";

export function applyTheme(theme: UserSettings["theme"]) {
  if (typeof window === "undefined") return;
  const prefersDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  document.documentElement.classList.toggle("dark", prefersDark);
}

interface PreferencesState extends StoredPreferences {
  setPreference: <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
  ) => Promise<void>;
  setPreferences: (patch: Partial<UserSettings>) => Promise<void>;
  hydrateFromServer: () => Promise<void>;
}

const initial = readPreferences();
if (typeof window !== "undefined") {
  applyTheme(initial.theme);
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  defaultFormat: initial.defaultFormat,
  defaultQuality: initial.defaultQuality,
  streamQuality: initial.streamQuality,
  theme: initial.theme,
  dirty: initial.dirty ?? false,

  setPreference: async (key, value) => {
    await get().setPreferences({ [key]: value });
  },

  setPreferences: async (patch) => {
    const current = get();
    const next: StoredPreferences = {
      defaultFormat: patch.defaultFormat ?? current.defaultFormat,
      defaultQuality: patch.defaultQuality ?? current.defaultQuality,
      streamQuality: patch.streamQuality ?? current.streamQuality,
      theme: patch.theme ?? current.theme,
      dirty: current.dirty,
    };

    if (patch.theme) {
      applyTheme(patch.theme);
    }

    const { isAuthenticated } = useAuthStore.getState();

    if (isAuthenticated) {
      next.dirty = false;
      set(next);
      writePreferences(next);
      try {
        const saved = await apiClient.updateSettings(patch);
        set({
          defaultFormat: saved.defaultFormat,
          defaultQuality: saved.defaultQuality,
          streamQuality: saved.streamQuality,
          theme: saved.theme,
          dirty: false,
        });
        writePreferences({
          defaultFormat: saved.defaultFormat,
          defaultQuality: saved.defaultQuality,
          streamQuality: saved.streamQuality,
          theme: saved.theme,
          dirty: false,
        });
      } catch {
        // Mark dirty if network update failed
        const fallback = { ...get(), dirty: true };
        set(fallback);
        writePreferences(fallback);
      }
    } else {
      next.dirty = true;
      set(next);
      writePreferences(next);
    }
  },

  hydrateFromServer: async () => {
    try {
      const current = get();
      if (current.dirty) {
        // Local has uncommitted guest changes — sync up to server
        const saved = await apiClient.updateSettings({
          defaultFormat: current.defaultFormat,
          defaultQuality: current.defaultQuality,
          streamQuality: current.streamQuality,
          theme: current.theme,
        });
        const updated: StoredPreferences = {
          defaultFormat: saved.defaultFormat,
          defaultQuality: saved.defaultQuality,
          streamQuality: saved.streamQuality,
          theme: saved.theme,
          dirty: false,
        };
        set(updated);
        writePreferences(updated);
        applyTheme(updated.theme);
      } else {
        // Adopt server settings
        const serverSettings = await apiClient.getSettings();
        const updated: StoredPreferences = {
          defaultFormat: serverSettings.defaultFormat,
          defaultQuality: serverSettings.defaultQuality,
          streamQuality: serverSettings.streamQuality,
          theme: serverSettings.theme,
          dirty: false,
        };
        set(updated);
        writePreferences(updated);
        applyTheme(updated.theme);
      }
    } catch {
      // Non-fatal — keep local preferences
    }
  },
}));
