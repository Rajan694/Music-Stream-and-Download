"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../../lib/api";
import { readGuestHistory } from "../../../../lib/history";
import { formatDuration, formatPlayedAt } from "../../../../lib/format";
import { useAuthStore } from "../../../../stores/auth.store";
import { usePlayerStore } from "../../../../stores/player.store";
import {
  EmptyState,
  ErrorState,
  Spinner,
} from "../../../../components/ui/States";

interface HistoryRow {
  videoId: string;
  title: string;
  uploaderName: string;
  duration: number;
  playedAt: string;
}

export default function HistoryPage() {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const {
    data: serverHistory,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["history"],
    queryFn: () => apiClient.getHistory(),
    enabled: isAuthenticated,
  });

  // Guests keep history in localStorage only (§23); it is read once per render
  // rather than held in state, since nothing else mutates it on this page.
  const rows: HistoryRow[] = isAuthenticated
    ? (serverHistory ?? [])
    : readGuestHistory();

  const syncLocal = useMutation({
    mutationFn: async () => {
      const local = readGuestHistory();
      if (local.length === 0) return;
      await apiClient.syncHistory(local);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["history"] }),
  });

  /** History rows are metadata only — playback needs the full video. */
  const play = async (videoId: string) => {
    setLoadingId(videoId);
    try {
      const video = await apiClient.getVideo(videoId);
      playTrack(video, [video]);
    } finally {
      setLoadingId(null);
    }
  };

  if (!bootstrapped) return <Spinner />;
  if (isAuthenticated && isLoading) return <Spinner label="Loading history…" />;
  if (isAuthenticated && isError) {
    return (
      <ErrorState
        title="Could not load history"
        message={error instanceof Error ? error.message : undefined}
      />
    );
  }

  const localCount = readGuestHistory().length;

  return (
    <div className="space-y-6">
      {isAuthenticated && localCount > 0 && (
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <p className="text-sm text-zinc-500">
            {localCount} tracks played on this device before signing in.
          </p>
          <button
            onClick={() => syncLocal.mutate()}
            disabled={syncLocal.isPending}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {syncLocal.isPending ? "Merging…" : "Merge into account"}
          </button>
        </div>
      )}

      {!isAuthenticated && (
        <p className="text-sm text-zinc-500">
          Stored on this device.{" "}
          <Link href="/login" className="underline">
            Sign in
          </Link>{" "}
          to sync across devices.
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing played yet"
          message="Tracks you play show up here."
          action={{ href: "/search", label: "Find music" }}
        />
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {rows.map((row) => (
            <li key={row.videoId} className="flex items-center gap-3 py-3">
              <button
                onClick={() => play(row.videoId)}
                disabled={loadingId !== null}
                className="flex-1 min-w-0 text-left disabled:opacity-50"
              >
                <p className="text-sm font-medium truncate">{row.title}</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {row.uploaderName} · {formatDuration(row.duration)} ·{" "}
                  {formatPlayedAt(row.playedAt)}
                </p>
              </button>

              <Link
                href={`/video/${row.videoId}`}
                className="shrink-0 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 px-2 py-1"
              >
                Details
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
