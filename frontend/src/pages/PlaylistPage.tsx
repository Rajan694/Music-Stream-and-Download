import { useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../lib/api";
import { formatDuration, pickThumbnail } from "../lib/format";
import { usePlayerStore } from "../stores/player.store";
import { useAuthStore } from "../stores/auth.store";
import { EmptyState, ErrorState, Spinner, SkeletonRow } from "../components/ui/States";
import { PlaylistDownloadButton } from "../components/player/PlaylistDownloadButton";
import { Play, Pin, PinOff, Loader2 } from "lucide-react";

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
      <div className="flex flex-col md:flex-row gap-8 items-start">
        {cover && (
          <img
            src={cover}
            alt=""
            className="w-full md:w-64 aspect-square object-cover rounded-2xl shadow-xl shadow-black/50 border border-white/5"
          />
        )}

        <div className="flex-1 min-w-0 space-y-4">
          <h1 className="text-3xl font-bold tracking-tighter text-white">
            {playlist.title}
          </h1>
          <p className="text-sm font-medium text-zinc-400">
            {playlist.uploaderName} • {playlist.videoCount} tracks
          </p>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              onClick={() =>
                playlist.videos[0] && playFrom(playlist.videos[0].id)
              }
              disabled={playlist.videos.length === 0 || loadingTrack !== null}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accent-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              <Play size={16} fill="currentColor" />
              Play
            </button>
            {isAuthenticated && (
              <button
                onClick={() => togglePin.mutate()}
                disabled={togglePin.isPending}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white/5 text-sm font-medium hover:bg-white/10 disabled:opacity-50"
              >
                {isPinned ? <PinOff size={16} /> : <Pin size={16} />}
                {isPinned ? "Unpin" : "Pin"}
              </button>
            )}
            {isAuthenticated && playlist.videos.length > 0 && (
              <PlaylistDownloadButton playlistId={id!} />
            )}
          </div>
        </div>
      </div>

      {playlist.videos.length === 0 ? (
        <EmptyState title="This playlist is empty" />
      ) : (
        <div className="divide-y divide-white/5">
          {playlist.videos.map((track, index) => (
            <div
              key={`${track.id}-${index}`}
              className="flex items-center gap-4 py-3 group hover:bg-white/5 px-2 rounded-lg transition-colors"
            >
              <span className="w-6 shrink-0 text-right text-xs font-medium text-zinc-500">
                {index + 1}
              </span>

              <button
                onClick={() => playFrom(track.id)}
                disabled={loadingTrack !== null}
                className="flex-1 min-w-0 text-left disabled:opacity-50"
              >
                <p className="text-sm font-semibold text-zinc-100 truncate group-hover:text-white">
                    {track.title}
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {track.uploaderName} • {formatDuration(track.duration)}
                </p>
              </button>

              {loadingTrack === track.id ? (
                <Loader2 className="animate-spin w-4 h-4 text-accent-primary" />
              ) : (
                <Link
                  to={`/video/${track.id}`}
                  className="text-xs font-medium text-zinc-500 hover:text-white px-2 py-1"
                >
                  View
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}