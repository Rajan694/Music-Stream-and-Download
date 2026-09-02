"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AudioFormat, AudioQuality } from "@music/shared";
import { apiClient, UserSettings } from "../../../../lib/api";
import { useAuthStore } from "../../../../stores/auth.store";
import {
  ErrorState,
  SignInRequired,
  Spinner,
} from "../../../../components/ui/States";

const FORMATS: AudioFormat[] = ["mp3", "webm", "ogg"];
const QUALITIES: AudioQuality[] = ["low", "medium", "high"];
const THEMES = ["light", "dark", "system"] as const;

/** Mirrors the inline script in the root layout that sets the class on first paint. */
function applyTheme(theme: UserSettings["theme"]) {
  const prefersDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  document.documentElement.classList.toggle("dark", prefersDark);
  if (theme === "system") localStorage.removeItem("theme");
  else localStorage.theme = theme;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const [saved, setSaved] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiClient.getSettings(),
    enabled: isAuthenticated,
  });

  // The stored preference wins over whatever the first-paint script guessed.
  useEffect(() => {
    if (data?.theme) applyTheme(data.theme);
  }, [data?.theme]);

  const update = useMutation({
    mutationFn: (patch: Partial<UserSettings>) =>
      apiClient.updateSettings(patch),
    onSuccess: (next) => {
      queryClient.setQueryData(["settings"], next);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    },
  });

  if (!bootstrapped) return <Spinner />;
  if (!isAuthenticated) return <SignInRequired what="settings" />;
  if (isLoading) return <Spinner label="Loading settings…" />;
  if (isError) {
    return (
      <ErrorState
        title="Could not load settings"
        message={error instanceof Error ? error.message : undefined}
      />
    );
  }

  const settings = data;

  return (
    <div className="space-y-8 max-w-lg">
      <Choice
        label="Default download format"
        options={FORMATS}
        value={settings?.defaultFormat}
        onSelect={(defaultFormat) => update.mutate({ defaultFormat })}
        render={(f) => f.toUpperCase()}
      />

      <Choice
        label="Default download quality"
        options={QUALITIES}
        value={settings?.defaultQuality}
        onSelect={(defaultQuality) => update.mutate({ defaultQuality })}
        render={(q) => q[0].toUpperCase() + q.slice(1)}
      />

      <Choice
        label="Theme"
        options={THEMES}
        value={settings?.theme}
        onSelect={(theme) => {
          // Apply immediately — waiting for the round trip makes the toggle
          // feel broken.
          applyTheme(theme);
          update.mutate({ theme });
        }}
        render={(t) => t[0].toUpperCase() + t.slice(1)}
      />

      <div className="h-5 text-sm">
        {update.isPending && <span className="text-zinc-500">Saving…</span>}
        {saved && !update.isPending && (
          <span className="text-green-600">Saved</span>
        )}
        {update.isError && (
          <span className="text-red-500">
            {update.error instanceof Error
              ? update.error.message
              : "Could not save"}
          </span>
        )}
      </div>
    </div>
  );
}

function Choice<T extends string>({
  label,
  options,
  value,
  onSelect,
  render,
}: {
  label: string;
  options: readonly T[];
  value: T | undefined;
  onSelect: (value: T) => void;
  render: (value: T) => string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <div
        className="mt-2 grid grid-cols-3 gap-2"
        role="radiogroup"
        aria-label={label}
      >
        {options.map((option) => (
          <button
            key={option}
            role="radio"
            aria-checked={value === option}
            onClick={() => onSelect(option)}
            className={`py-2 rounded-lg border text-sm font-medium transition-colors ${
              value === option
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300"
            }`}
          >
            {render(option)}
          </button>
        ))}
      </div>
    </div>
  );
}
