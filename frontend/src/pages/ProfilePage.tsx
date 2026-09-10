import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/api";
import { useAuthStore } from "../stores/auth.store";
import { usePreferencesStore } from "../stores/preferences.store";
import { EmptyState, Spinner } from "../components/ui/States";
import { Choice } from "../components/ui/Choice";
import type { AudioFormat, AudioQuality } from "@music/shared";
import { readGuestHistory } from "../lib/history";
import { LogOut, History, Library, Settings } from "lucide-react";

const FORMATS: AudioFormat[] = ["mp3", "webm", "ogg"];
const QUALITIES: AudioQuality[] = ["low", "medium", "high"];
const THEMES = ["light", "dark", "system"] as const;

export function ProfilePage() {
  const navigate = useNavigate();
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
    try {
      await apiClient.logout();
    } catch {
      // Ignore — clear local session regardless of server-side logout result.
    }
    clearAuth();
    navigate("/login");
  };

  if (!bootstrapped) return <Spinner />;

  return (
    <div className="space-y-10 max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tighter text-white">Profile</h1>

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
        </div>
      )}

      {isAuthenticated && (
        <section className="bg-background-1 border border-white/5 p-6 rounded-2xl flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Signed in as
            </p>
            <p className="text-lg font-medium text-white">{user?.email}</p>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </section>
      )}

      {isAuthenticated && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            to="/profile/history"
            className="bg-background-1 border border-white/5 p-6 rounded-2xl hover:border-accent-primary/50 transition-colors group"
          >
            <div className="text-accent-primary mb-3"><History size={24} /></div>
            <p className="text-3xl font-bold tabular-nums text-white">
              {history?.length ?? "—"}
            </p>
            <p className="text-sm text-zinc-400 mt-1">Recently played</p>
          </Link>

          <Link
            to="/profile/playlists"
            className="bg-background-1 border border-white/5 p-6 rounded-2xl hover:border-accent-primary/50 transition-colors group"
          >
            <div className="text-accent-primary mb-3"><Library size={24} /></div>
            <p className="text-3xl font-bold tabular-nums text-white">
              {pinned?.length ?? "—"}
            </p>
            <p className="text-sm text-zinc-400 mt-1">Pinned playlists</p>
          </Link>
        </div>
      )}

      <section className="space-y-6 pt-4 border-t border-white/5">
        <div className="flex items-center gap-3">
          <Settings className="text-zinc-500" size={20} />
          <h2 className="text-xl font-bold text-white">Preferences</h2>
        </div>

        <div className="grid gap-8 p-6 bg-background-1 border border-white/5 rounded-2xl">
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
    </div>
  );
}