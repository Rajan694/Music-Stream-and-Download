import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { MdError, MdSchedule, MdSync, MdSystemUpdateAlt } from "react-icons/md";
import { apiClient } from "../lib/api";
import { saveCompletedDownload } from "../lib/downloads-save";
import { useAuthStore } from "../stores/auth.store";
import { EmptyState, Spinner, ErrorState } from "../components/ui/States";

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "Size unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DownloadsPage() {
  const { isAuthenticated } = useAuthStore();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["downloads"],
    queryFn: () => apiClient.listDownloads(),
    enabled: isAuthenticated,
    refetchInterval: (query) => {
      const hasActive = query.state.data?.some((job) =>
        ["queued", "resolving", "downloading", "transcoding"].includes(
          job.state
        )
      );
      return hasActive ? 3000 : false;
    },
  });

  // Only jobs seen finishing *while this page is open* get saved. Firing on the
  // first snapshot instead would dump every past download on the user's disk.
  const seenStates = useRef(new Map<string, string>());

  useEffect(() => {
    if (!data) return;
    const previous = seenStates.current;
    const first = previous.size === 0;

    for (const job of data) {
      const before = previous.get(job.id);
      previous.set(job.id, job.state);
      if (first || before === undefined || before === job.state) continue;
      if (job.state === "completed") {
        void saveCompletedDownload(job.id, job.kind);
      }
    }
  }, [data]);

  if (!isAuthenticated) {
    return (
      <EmptyState
        title="Sign in required"
        message="You must be signed in to view and start downloads."
        action={{ href: "/login", label: "Sign in" }}
      />
    );
  }

  if (isLoading) return <Spinner label="Loading downloads…" />;
  if (isError) {
    return (
      <ErrorState
        title="Could not load downloads"
        message={error instanceof Error ? error.message : undefined}
      />
    );
  }

  if (!data?.length) {
    return (
      <EmptyState
        title="No downloads"
        message="You haven't downloaded any tracks yet."
        action={{ href: "/search", label: "Find music" }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Downloads</h1>

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {data.map((job) => {
          const isCompleted = job.state === "completed";
          const isFailed = job.state === "failed" || job.state === "cancelled";
          const isActive = !isCompleted && !isFailed;

          return (
            <li key={job.id} className="py-4 flex flex-col sm:flex-row gap-4 sm:items-center">
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-sm font-semibold truncate leading-none">
                    {job.title}
                  </h3>
                  <span
                    className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 ${
                      isCompleted
                        ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                        : isFailed
                          ? "bg-red-500/10 text-red-500 border border-red-500/20"
                          : job.state === "downloading"
                            ? "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                            : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                    }`}
                  >
                    {isCompleted && <MdSystemUpdateAlt className="w-3.5 h-3.5" />}
                    {isActive && job.state === "downloading" && <MdSync className="w-3.5 h-3.5 animate-spin" />}
                    {isActive && job.state !== "downloading" && <MdSchedule className="w-3.5 h-3.5" />}
                    {isFailed && <MdError className="w-3.5 h-3.5" />}
                    {job.state}
                  </span>
                </div>

                <div className="text-xs text-zinc-500 flex flex-wrap gap-x-2 gap-y-1">
                  <span className="capitalize">{job.quality} • {job.format}</span>
                  {job.kind === "playlist" && <span>• Playlist</span>}
                  {isCompleted && <span>• {formatBytes(job.fileSize)}</span>}
                  <span>• {new Date(job.createdAt).toLocaleDateString()}</span>
                </div>

                {isActive && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-zinc-500 mb-1">
                      <span>{job.progress}%</span>
                    </div>
                    <div className="h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all duration-500"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {isFailed && job.errorCode && (
                  <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                    <MdError className="w-3.5 h-3.5" />
                    {job.errorCode}
                  </p>
                )}
              </div>

              {isCompleted && (
                <div className="shrink-0 flex gap-2">
                  {job.kind === "video" && job.videoId && (
                    <Link
                      to={`/video/${job.videoId}`}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      View
                    </Link>
                  )}
                  {job.kind === "playlist" && job.playlistId && (
                    <Link
                      to={`/playlist/${job.playlistId}`}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      View
                    </Link>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}