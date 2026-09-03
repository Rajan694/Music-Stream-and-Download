import { UserSettings, UserSettingsSchema } from "@music/shared";

export const PREFERENCES_KEY = "music-stream:preferences";

export interface StoredPreferences extends UserSettings {
  dirty?: boolean;
}

export function getDefaultPreferences(): UserSettings {
  return UserSettingsSchema.parse({});
}

export function readPreferences(): StoredPreferences {
  if (typeof window === "undefined") {
    return { ...getDefaultPreferences(), dirty: false };
  }

  const defaults = getDefaultPreferences();

  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    let parsed: Partial<StoredPreferences> = {};

    if (raw) {
      parsed = JSON.parse(raw);
    }

    // Migrate legacy theme if present and preferences hasn't specified theme
    const legacyTheme = localStorage.getItem("theme");
    if (legacyTheme && (legacyTheme === "light" || legacyTheme === "dark")) {
      if (!parsed.theme) {
        parsed.theme = legacyTheme;
        parsed.dirty = true;
      }
      localStorage.removeItem("theme");
    }

    const merged: StoredPreferences = {
      defaultFormat: parsed.defaultFormat ?? defaults.defaultFormat,
      defaultQuality: parsed.defaultQuality ?? defaults.defaultQuality,
      streamQuality: parsed.streamQuality ?? defaults.streamQuality,
      theme: parsed.theme ?? defaults.theme,
      dirty: parsed.dirty ?? false,
    };

    return merged;
  } catch {
    return { ...defaults, dirty: false };
  }
}

export function writePreferences(prefs: StoredPreferences): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
  } catch {
    // Storage full or disabled
  }
}
