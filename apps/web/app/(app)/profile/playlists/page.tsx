"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../../lib/api";
import { useAuthStore } from "../../../../stores/auth.store";
import {
  EmptyState,
  ErrorState,
  SignInRequired,
  Spinner,
} from "../../../../components/ui/States";

export default function PinnedPlaylistsPage() {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["pinned-playlists"],
    queryFn: () => apiClient.getPinnedPlaylists(),
    enabled: isAuthenticated,
  });

  const unpin = useMutation({
    mutationFn: (playlistId: string) => apiClient.unpinPlaylist(playlistId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["pinned-playlists"] }),
  });

  if (!bootstrapped) return <Spinner />;
  if (!isAuthenticated) return <SignInRequired what="pinned playlists" />;
  if (isLoading) return <Spinner label="Loading playlists…" />;
  if (isError) {
    return (
      <ErrorState
        title="Could not load playlists"
        message={error instanceof Error ? error.message : undefined}
      />
    );
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        title="No pinned playlists"
        message="Open a playlist and choose “Pin to home” to keep it here."
        action={{ href: "/search", label: "Find a playlist" }}
      />
    );
  }

  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {data.map((playlist) => (
        <li
          key={playlist.id}
          className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col"
        >
          <Link href={`/playlist/${playlist.playlistId}`} className="block">
            {playlist.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={playlist.thumbnailUrl}
                alt=""
                className="w-full aspect-video object-cover bg-zinc-200 dark:bg-zinc-800"
              />
            )}
            <div className="p-3">
              <p className="text-sm font-medium line-clamp-2">
                {playlist.title}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                {playlist.videoCount} tracks
              </p>
            </div>
          </Link>

          <button
            onClick={() => unpin.mutate(playlist.playlistId)}
            disabled={unpin.isPending}
            className="mt-auto border-t border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs font-medium text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 disabled:opacity-50"
          >
            Unpin
          </button>
        </li>
      ))}
    </ul>
  );
}
