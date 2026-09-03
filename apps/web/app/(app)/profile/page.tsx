"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../../lib/api";
import { useAuthStore } from "../../../stores/auth.store";
import { usePreferencesStore } from "../../../stores/preferences.store";
import { EmptyState, Spinner } from "../../../components/ui/States";
import { Choice } from "../../../components/ui/Choice";
import type { AudioFormat, AudioQuality } from "@music/shared";
import { readGuestHistory } from "../../../lib/history";

const FORMATS: AudioFormat[] = ["mp3", "webm", "ogg"];
const QUALITIES: AudioQuality[] = ["low", "medium", "high"];
const THEMES = ["light", "dark", "system"] as const;

export default function ProfilePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const clearAuth = useAuthStore((s) => s.logout);

  const preferences = usePreferencesStore();

  const { data: pinned } = useQuery({
    queryKey: ["pinned-playlists"],
    queryFn: () => apiClient.getPinnedPlaylists(),
    enabled: isAuthenticated,
  });

  const { data: history } = useQuery({
    queryKey: ["history"],
    queryFn: () => apiClient.getHistory(),
    enabled: isAuthenticated,
  });

  const onLogout = async () => {
    // Revoke the refresh family server-side before dropping local state, or the
    // cookie would outlive the session it belongs to.
    await apiClient.logout().catch(() => undefined);
    clearAuth();
    router.push("/login");
  };

  // Waiting on the session bootstrap: showing the guest prompt here would
  // flash it at a signed-in user on every reload.
  if (!bootstrapped) return <Spinner />;

  return (
    <div className="space-y-8 max-w-2xl">
      {!isAuthenticated && (
        <div className="space-y-4">
          <EmptyState
            title="You are browsing as a guest"
            message={
              readGuestHistory().length > 0
                ? `${readGuestHistory().length} recently played tracks are stored on this device. Sign in to keep them across devices.`
                : "Playback works without an account. Sign in to sync history, pin playlists and download."
            }
            action={{ href: "/login", label: "Sign in" }}
          />
          <p className="text-center text-sm text-zinc-500">
            <Link href="/profile/history" className="underline">
              View local history
            </Link>
          </p>
        </div>
      )}

      {isAuthenticated && (
        <>
          <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Signed in as
            </p>
            <p className="text-lg font-medium">{user?.email}</p>
          </section>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              href="/profile/history"
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
            >
              <p className="text-2xl font-bold tabular-nums">
                {history?.length ?? "—"}
              </p>
              <p className="text-sm text-zinc-500 mt-1">Recently played</p>
            </Link>

            <Link
              href="/profile/playlists"
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
            >
              <p className="text-2xl font-bold tabular-nums">
                {pinned?.length ?? "—"}
              </p>
              <p className="text-sm text-zinc-500 mt-1">Pinned playlists</p>
            </Link>
          </div>
        </>
      )}

      <section className="space-y-8 pt-4 border-t border-zinc-200 dark:border-zinc-800">
        <div>
          <h2 className="text-xl font-bold">Preferences</h2>
          {!isAuthenticated && (
            <p className="text-sm text-zinc-500 mt-1">
              Saved on this device. Sign in to sync across devices.
            </p>
          )}
        </div>

        <div className="space-y-8 max-w-lg">
          <Choice
            label="Theme"
            options={THEMES}
            value={preferences.theme}
            onSelect={(theme) => preferences.setPreference("theme", theme)}
            render={(t) => t[0].toUpperCase() + t.slice(1)}
          />

          <Choice
            label="Playback quality"
            description="Closest available stream is used"
            options={QUALITIES}
            value={preferences.streamQuality}
            onSelect={(streamQuality) =>
              preferences.setPreference("streamQuality", streamQuality)
            }
            render={(q) => q[0].toUpperCase() + q.slice(1)}
          />

          <Choice
            label="Download format"
            options={FORMATS}
            value={preferences.defaultFormat}
            onSelect={(defaultFormat) =>
              preferences.setPreference("defaultFormat", defaultFormat)
            }
            render={(f) => f.toUpperCase()}
          />

          <Choice
            label="Download quality"
            options={QUALITIES}
            value={preferences.defaultQuality}
            onSelect={(defaultQuality) =>
              preferences.setPreference("defaultQuality", defaultQuality)
            }
            render={(q) => q[0].toUpperCase() + q.slice(1)}
          />
        </div>
      </section>

      {isAuthenticated && (
        <button
          onClick={onLogout}
          className="px-4 py-2 rounded-lg border border-red-200 dark:border-red-900/40 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10"
        >
          Sign out
        </button>
      )}
    </div>
  );
}
