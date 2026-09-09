import { Link, useParams } from "react-router";
import { usePlayerStore } from "../stores/player.store";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/api";
import { formatCount, formatDuration, pickThumbnail } from "../lib/format";
import { EmptyState, ErrorState, Spinner } from "../components/ui/States";

export function VideoPage() {
  const { id } = useParams<{ id: string }>();

  const playTrack = usePlayerStore((s) => s.playTrack);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const playNextInQueue = usePlayerStore((s) => s.playNextInQueue);

  const {
    data: video,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["video", id],
    queryFn: () => apiClient.getVideo(id!),
    enabled: Boolean(id),
  });

  const { data: suggestions } = useQuery({
    queryKey: ["suggestions", id],
    queryFn: () => apiClient.getSuggestions(id!),
    enabled: Boolean(video),
    retry: false,
  });

  if (isLoading) return <Spinner label="Loading video…" />;
  if (isError) {
    return (
      <ErrorState
        title="Could not load this video"
        message={error instanceof Error ? error.message : undefined}
      />
    );
  }
  if (!video)
    return (
      <EmptyState
        title="Video not found"
        action={{ href: "/search", label: "Back to search" }}
      />
    );

  const thumbnail = pickThumbnail(video.thumbnails);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row gap-6">
        {thumbnail && (
          <img
            src={thumbnail}
            alt=""
            className="w-full sm:w-64 aspect-video object-cover rounded-xl bg-zinc-200 dark:bg-zinc-800"
          />
        )}

        <div className="flex-1 min-w-0 space-y-3">
          <h1 className="text-2xl font-bold tracking-tight">{video.title}</h1>
          <p className="text-zinc-500">
            {video.uploaderName}
            {" · "}
            {formatDuration(video.duration)}
            {video.viewCount ? ` · ${formatCount(video.viewCount)} views` : ""}
          </p>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              onClick={() => playTrack(video)}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              Play
            </button>
            <button
              onClick={() => playNextInQueue(video)}
              className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Play next
            </button>
            <button
              onClick={() => addToQueue(video)}
              className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Add to queue
            </button>
            <button
              onClick={() => globalThis.openDownloadDialog?.(video)}
              className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Download
            </button>
          </div>
        </div>
      </div>

      {video.description && (
        <details className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Description
          </summary>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap line-clamp-[12]">
            {video.description}
          </p>
        </details>
      )}

      {suggestions && suggestions.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Up next</h2>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {suggestions.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-3">
                <button
                  onClick={() => playTrack(item)}
                  className="flex-1 min-w-0 text-left flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 rounded-lg px-2 -mx-2 py-1"
                  title="Play now"
                >
                  {pickThumbnail(item.thumbnails) && (
                    <img
                      src={pickThumbnail(item.thumbnails)}
                      alt=""
                      className="w-24 aspect-video object-cover rounded-md bg-zinc-200 dark:bg-zinc-800 shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium line-clamp-2">
                      {item.title}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      {item.uploaderName} · {formatDuration(item.duration)}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => playNextInQueue(item)}
                    className="px-2 py-1 rounded text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Play next
                  </button>
                  <button
                    onClick={() => addToQueue(item)}
                    className="px-2 py-1 rounded text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Add to queue
                  </button>
                  <Link
                    to={`/video/${item.id}`}
                    className="px-2 py-1 rounded text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Details
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
