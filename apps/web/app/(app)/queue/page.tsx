"use client";

import Link from "next/link";
import { MdArrowDownward, MdArrowUpward, MdClose } from "react-icons/md";
import { usePlayerStore } from "../../../stores/player.store";
import { formatDuration, pickThumbnail } from "../../../lib/format";
import { EmptyState } from "../../../components/ui/States";

export default function QueuePage() {
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
        <h1 className="text-3xl font-bold tracking-tight">Queue</h1>
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
        <h1 className="text-3xl font-bold tracking-tight">Queue</h1>
        <button
          onClick={clearQueue}
          className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Clear
        </button>
      </div>

      {currentTrack && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Now playing
          </h2>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/15 border border-blue-100 dark:border-blue-900/25">
            {pickThumbnail(currentTrack.thumbnails) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={pickThumbnail(currentTrack.thumbnails)}
                alt=""
                className="w-14 h-14 object-cover rounded-md bg-zinc-200 dark:bg-zinc-800 shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">
                {currentTrack.title}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {currentTrack.uploaderName} ·{" "}
                {formatDuration(currentTrack.duration)}
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Next ({upNext.length})
        </h2>

        {upNext.length === 0 ? (
          <p className="text-sm text-zinc-500 py-4">End of queue.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {upNext.map((track, offset) => {
              // Offsets are relative to the slice; queue actions need absolute
              // positions.
              const index = queueIndex + 1 + offset;

              return (
                <li
                  key={`${track.id}-${index}`}
                  className="flex items-center gap-3 py-3"
                >
                  <button
                    onClick={() => playAt(index)}
                    className="flex-1 min-w-0 text-left"
                    title="Play now"
                  >
                    <p className="text-sm font-medium truncate">
                      {track.title}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {track.uploaderName} · {formatDuration(track.duration)}
                    </p>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => moveInQueue(index, index - 1)}
                      disabled={offset === 0}
                      aria-label="Move up"
                      className="p-2 rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30"
                    >
                      <MdArrowUpward className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => moveInQueue(index, index + 1)}
                      disabled={offset === upNext.length - 1}
                      aria-label="Move down"
                      className="p-2 rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30"
                    >
                      <MdArrowDownward className="w-4 h-4" />
                    </button>
                    <Link
                      href={`/video/${track.id}`}
                      className="p-2 rounded-md text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      Details
                    </Link>
                    <button
                      onClick={() => removeFromQueue(index)}
                      aria-label="Remove from queue"
                      className="p-2 rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <MdClose className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
