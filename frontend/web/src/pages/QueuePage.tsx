import { Link } from "react-router";
import { usePlayerStore } from "../stores/player.store";
import { formatDuration, pickThumbnail } from "../lib/format";
import { EmptyState } from "../components/ui/States";
import { ArrowUp, ArrowDown, X, Play, Trash2 } from "lucide-react";

export function QueuePage() {
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playAt = usePlayerStore((s) => s.playAt);
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue);
  const moveInQueue = usePlayerStore((s) => s.moveInQueue);
  const clearQueue = usePlayerStore((s) => s.clearQueue);

  if (queue.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight text-white">Queue</h1>
        <EmptyState
          title="Nothing queued"
          message="Play something, or add tracks from a video or playlist page."
          action={{ href: "/search", label: "Find music" }}
        />
      </div>
    );
  }

  const upNext = queue.slice(queueIndex + 1);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Queue</h1>
          <p className="text-xs text-zinc-400 mt-1">{queue.length} tracks total</p>
        </div>
        <button
          onClick={clearQueue}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <Trash2 size={14} />
          Clear Queue
        </button>
      </div>

      {currentTrack && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-accent-primary">
            Now playing
          </h2>
          <div className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-sm">
            {pickThumbnail(currentTrack.thumbnails) && (
              <img
                src={pickThumbnail(currentTrack.thumbnails)}
                alt=""
                className="w-12 h-12 object-cover rounded-xl bg-background-2 shrink-0 shadow-md"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">
                {currentTrack.title}
              </p>
              <p className="text-xs text-zinc-400 mt-0.5">
                {currentTrack.uploaderName} • {formatDuration(currentTrack.duration)}
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Up next ({upNext.length})
        </h2>

        {upNext.length === 0 ? (
          <p className="text-xs text-zinc-500 py-4">End of queue.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {upNext.map((track, offset) => {
              const index = queueIndex + 1 + offset;
              return (
                <div
                  key={`${track.id}-${index}`}
                  className="flex items-center gap-3 py-2.5 group hover:bg-white/5 px-2 -mx-2 rounded-xl transition-colors"
                >
                  <button
                    onClick={() => playAt(index)}
                    className="flex-1 min-w-0 text-left flex items-center gap-3"
                    title="Play now"
                  >
                    <div className="w-6 text-center text-xs font-medium text-zinc-500">
                      {offset + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-200 group-hover:text-white truncate">
                        {track.title}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5 truncate">
                        {track.uploaderName} • {formatDuration(track.duration)}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => moveInQueue(index, index - 1)}
                      disabled={offset === 0}
                      aria-label="Move up"
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 disabled:opacity-20 transition-colors"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      onClick={() => moveInQueue(index, index + 1)}
                      disabled={offset === upNext.length - 1}
                      aria-label="Move down"
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 disabled:opacity-20 transition-colors"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      onClick={() => removeFromQueue(index)}
                      aria-label="Remove from queue"
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-white/5 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}