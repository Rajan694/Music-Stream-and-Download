import { useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../lib/api";
import { formatDuration, pickThumbnail } from "../lib/format";
import { usePlayerStore } from "../stores/player.store";
import { useAuthStore } from "../stores/auth.store";
import {
  EmptyState,
  ErrorState,
  Spinner,
} from "../components/ui/States";
import { PlaylistDownloadButton } from "../components/player/PlaylistDownloadButton";

export function PlaylistPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const [loadingTrack, setLoadingTrack] = useState<string | null>(null);

  const {
    data: playlist,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["playlist", id],
    queryFn: () => apiClient.getPlaylist(id!),
    enabled: Boolean(id),
  });

  const { data: pinned } = useQuery({
    queryKey: ["pinned-playlists"],
    queryFn: () => apiClient.getPinnedPlaylists(),
    enabled: isAuthenticated,
  });

  const isPinned = pinned?.some((p) => p.playlistId === id) ?? false;

  const togglePin = useMutation({
    mutationFn: async () => {
      if (!playlist) return;
      if (isPinned) {
        await apiClient.unpinPlaylist(id!);
      } else {
        await apiClient.pinPlaylist({
          playlistId: id!,
          title: playlist.title,
          thumbnailUrl: pickThumbnail(playlist.thumbnails),
          videoCount: playlist.videoCount,
        });
      }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["pinned-playlists"] }),
  });

  const playFrom = async (videoId: string) => {
    setLoadingTrack(videoId);
    try {
      const video = await apiClient.getVideo(videoId);
      playTrack(video, [video]);
    } finally {
      setLoadingTrack(null);
    }
  };

  if (isLoading) return <Spinner label="Loading playlist…" />;
  if (isError) {
    return (
      <ErrorState
        title="Could not load this playlist"
        message={error instanceof Error ? error.message : undefined}
      />
    );
  }
  if (!playlist) {
    return (
      <EmptyState
        title="Playlist not found"
        action={{ href: "/search", label: "Back to search" }}
      />
    );
  }

  const cover = pickThumbnail(playlist.thumbnails);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row gap-6">
        {cover && (
          <img
            src={cover}
            alt=""
            className="w-full sm:w-56 aspect-square object-cover rounded-xl bg-zinc-200 dark:bg-zinc-800"
          />
        )}

        <div className="flex-1 min-w-0 space-y-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {playlist.title}
          </h1>
          <p className="text-zinc-500">
            {playlist.uploaderName} · {playlist.videoCount} tracks
          </p>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              onClick={() =>
                playlist.videos[0] && playFrom(playlist.videos[0].id)
              }
              disabled={playlist.videos.length === 0 || loadingTrack !== null}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              Play
            </button>
            {isAuthenticated && (
              <button
                onClick={() => togglePin.mutate()}
                disabled={togglePin.isPending}
                className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
              >
                {isPinned ? "Unpin" : "Pin to home"}
              </button>
            )}
            {isAuthenticated && playlist.videos.length > 0 && (
              <PlaylistDownloadButton playlistId={id!} />
            )}
          </div>

          {togglePin.isError && (
            <p className="text-sm text-red-500">
              {togglePin.error instanceof Error
                ? togglePin.error.message
                : "Could not update pin"}
            </p>
          )}
        </div>
      </div>

      {playlist.videos.length === 0 ? (
        <EmptyState title="This playlist is empty" />
      ) : (
        <ol className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {playlist.videos.map((track, index) => (
            <li
              key={`${track.id}-${index}`}
              className="flex items-center gap-3 py-3"
            >
              <span className="w-8 shrink-0 text-right text-sm tabular-nums text-zinc-400">
                {index + 1}
              </span>

              <button
                onClick={() => playFrom(track.id)}
                disabled={loadingTrack !== null}
                className="flex-1 min-w-0 text-left disabled:opacity-50"
              >
                <p className="text-sm font-medium truncate">{track.title}</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {track.uploaderName} · {formatDuration(track.duration)}
                </p>
              </button>

              {loadingTrack === track.id && <Spinner />}

              <Link
                to={`/video/${track.id}`}
                className="shrink-0 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 px-2 py-1"
              >
                Details
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}