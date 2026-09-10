import { Link, useParams } from "react-router";
import { usePlayerStore } from "../stores/player.store";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/api";
import { formatCount, formatDuration, pickThumbnail } from "../lib/format";
import { EmptyState, ErrorState, Spinner } from "../components/ui/States";
import { useAuthStore } from "../stores/auth.store";
import { Play, Download, Search, Radio, ListPlus, MoreVertical, Settings2, Info } from "lucide-react";

export function VideoPage() {
  const { id } = useParams<{ id: string }>();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

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
      {/* Cinematic Header Block */}
      <div className="relative rounded-2xl overflow-hidden bg-background-2 border border-white/5">
        {/* Backdrop for 16:9 thumbnails applied as cover */}
        {thumbnail && (
          <div 
            className="absolute inset-0 blur-3xl opacity-30 bg-center bg-cover scale-110 pointer-events-none"
            style={{ backgroundImage: `url(${thumbnail})` }}
          />
        )}
        
        <div className="relative flex flex-col md:flex-row gap-6 p-6">
          {thumbnail && (
            <div className="relative w-full md:w-80 aspect-video shrink-0 rounded-xl overflow-hidden shadow-2xl">
              <img
                src={thumbnail}
                alt=""
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/20 ring-1 ring-inset ring-white/10 rounded-xl" />
            </div>
          )}

          <div className="flex-1 min-w-0 flex flex-col justify-end">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tighter text-white mb-2">
              {video.title}
            </h1>
            <p className="text-sm font-medium text-zinc-400 mb-6">
              {video.uploaderName}
              {" • "}
              {formatDuration(video.duration)}
              {video.viewCount ? ` • ${formatCount(video.viewCount)} views` : ""}
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => playTrack(video)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accent-primary text-white text-sm font-medium hover:opacity-90 shadow-lg shadow-accent-primary/20 transition-all"
              >
                <Play size={16} fill="currentColor" />
                Play
              </button>
              <button
                onClick={() => playNextInQueue(video)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 text-zinc-300 text-sm font-medium hover:bg-white/10 transition-colors"
              >
                <Radio size={16} />
                Play next
              </button>
              <button
                onClick={() => addToQueue(video)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 text-zinc-300 text-sm font-medium hover:bg-white/10 transition-colors hidden sm:flex"
              >
                <ListPlus size={16} />
                Add to queue
              </button>
              {isAuthenticated && (
                <button
                  onClick={() => globalThis.openDownloadDialog?.(video)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 text-zinc-300 text-sm font-medium hover:text-accent-primary hover:bg-white/10 transition-colors ml-auto sm:ml-0"
                >
                  <Download size={16} />
                  <span className="hidden sm:inline">Download</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {video.description && (
        <details className="rounded-xl bg-background-1 border border-white/5 group [&_summary::-webkit-details-marker]:hidden">
          <summary className="cursor-pointer text-sm font-semibold p-4 flex items-center justify-between text-zinc-300 group-open:border-b group-open:border-white/5">
            <div className="flex items-center gap-2">
              <Info size={16} className="text-zinc-500" />
              Description
            </div>
          </summary>
          <div className="p-4 text-sm text-zinc-400 whitespace-pre-wrap leading-relaxed opacity-90 max-h-96 overflow-y-auto">
            {video.description}
          </div>
        </details>
      )}

      {suggestions && suggestions.length > 0 && (
        <section className="space-y-4 pt-4">
          <h2 className="text-lg font-bold text-white px-1">Up next</h2>
          <div className="divide-y divide-white/5">
            {suggestions.map((item) => (
              <div key={item.id} className="flex items-center gap-4 py-3 group hover:bg-white/5 px-2 -mx-2 rounded-xl transition-colors">
                <button
                  onClick={() => playTrack(item)}
                  className="flex-1 min-w-0 text-left flex items-center gap-4"
                  title="Play now"
                >
                  <div className="relative w-24 md:w-32 aspect-video rounded-lg overflow-hidden shrink-0 bg-background-2 shadow-md">
                    {pickThumbnail(item.thumbnails) && (
                      <img
                        src={pickThumbnail(item.thumbnails)}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    )}
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play size={16} className="text-white fill-white" />
                    </div>
                    {item.duration > 0 && (
                      <span className="absolute bottom-1 right-1 bg-black/80 backdrop-blur-sm text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                        {formatDuration(item.duration)}
                      </span>
                    )}
                  </div>
                  
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-200 group-hover:text-white line-clamp-2">
                      {item.title}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      {item.uploaderName}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => playNextInQueue(item)}
                    className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 hidden sm:block"
                    title="Play next"
                  >
                    <Radio size={16} />
                  </button>
                  <button
                    onClick={() => addToQueue(item)}
                    className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10"
                    title="Add to queue"
                  >
                    <ListPlus size={16} />
                  </button>
                  <Link
                    to={`/video/${item.id}`}
                    className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10"
                    title="Details"
                  >
                    <MoreVertical size={16} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
