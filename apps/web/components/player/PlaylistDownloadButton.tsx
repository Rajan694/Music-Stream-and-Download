"use client";

import { useEffect, useRef, useState } from "react";
import { apiClient } from "../../lib/api";
import { usePreferencesStore } from "../../stores/preferences.store";
import type { PlaylistDownloadEstimate } from "../../lib/api";

const FORMATS = ["mp3", "webm", "ogg"] as const;
const QUALITIES = ["low", "medium", "high"] as const;

const POLL_MS = 2000;
const TERMINAL_STATES = new Set(["completed", "failed", "cancelled"]);

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "Size unknown";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Queues a whole playlist and follows the parent job to completion.
 *
 * Polls rather than using SSE: the single-track dialog opens a stream per job,
 * and a playlist runs long enough that holding a connection open for the whole
 * run buys nothing over a 2s poll.
 */
export function PlaylistDownloadButton({ playlistId }: { playlistId: string }) {
  const defaultFormat = usePreferencesStore((s) => s.defaultFormat);
  const defaultQuality = usePreferencesStore((s) => s.defaultQuality);

  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<(typeof FORMATS)[number]>(defaultFormat);
  const [quality, setQuality] = useState<(typeof QUALITIES)[number]>(defaultQuality);

  // Tagged with the profile it was computed for, so a result for the previous
  // format/quality is recognisably stale instead of needing a synchronous
  // reset every time the effect re-runs.
  const [estimate, setEstimate] = useState<{
    profile: string;
    data: PlaylistDownloadEstimate;
  } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [state, setState] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [error, setError] = useState("");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Re-estimate whenever the profile changes while the panel is open.
  useEffect(() => {
    if (!open || jobId) return;

    let cancelled = false;

    apiClient
      .estimatePlaylistDownload(playlistId, format, quality)
      .then((result) => {
        if (cancelled) return;
        setEstimate({ profile: `${format}:${quality}`, data: result });
        setError("");
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Estimate failed");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, jobId, playlistId, format, quality]);

  // Stop polling if the page navigates away mid-run.
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const start = async () => {
    setError("");
    setState("queued");
    setProgress(0);

    try {
      const job = await apiClient.createPlaylistDownload(
        playlistId,
        format,
        quality,
      );
      setJobId(job.id);
      setState(job.state);

      pollRef.current = setInterval(async () => {
        try {
          const snapshot = await apiClient.getDownload(job.id);
          setState(snapshot.state);
          setProgress(snapshot.progress);
          setDoneCount(
            snapshot.items.filter((item) => item.state === "completed").length,
          );

          if (TERMINAL_STATES.has(snapshot.state)) {
            if (pollRef.current) clearInterval(pollRef.current);
            if (snapshot.state === "failed") {
              setError(snapshot.errorCode ?? "Playlist download failed");
            }
          }
        } catch (e) {
          if (pollRef.current) clearInterval(pollRef.current);
          setState("failed");
          setError(e instanceof Error ? e.message : "Lost track of the job");
        }
      }, POLL_MS);
    } catch (e) {
      setState("failed");
      setError(e instanceof Error ? e.message : "Could not start download");
    }
  };

  /**
   * The archive URL carries the access token as a query param, because a plain
   * navigation cannot set an Authorization header. That token lasts 15 minutes
   * while a playlist can transcode for longer, so mint a fresh one immediately
   * before navigating rather than handing the browser an expired link.
   */
  const saveArchive = async () => {
    if (!jobId) return;
    try {
      await apiClient.refresh();
    } catch {
      // Refresh failed — try the existing token rather than blocking the save.
    }
    window.location.href = apiClient.playlistArchiveUrl(jobId);
  };

  if (!open) {
    return (
      <button
        onClick={() => {
          const prefs = usePreferencesStore.getState();
          setFormat(prefs.defaultFormat);
          setQuality(prefs.defaultQuality);
          setOpen(true);
        }}
        className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        Download all
      </button>
    );
  }

  const running = state !== "idle" && !TERMINAL_STATES.has(state);
  // Null while a fetch for the current profile is still in flight.
  const current =
    estimate?.profile === `${format}:${quality}` ? estimate.data : null;

  return (
    <div className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-semibold">Download playlist</p>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          Close
        </button>
      </div>

      {!jobId && (
        <>
          <div className="flex flex-wrap gap-2">
            {FORMATS.map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${
                  format === f
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300"
                }`}
              >
                {f.toUpperCase()}
              </button>
            ))}
            <span className="w-px bg-zinc-200 dark:bg-zinc-700 mx-1" />
            {QUALITIES.map((q) => (
              <button
                key={q}
                onClick={() => setQuality(q)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium capitalize ${
                  quality === q
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300"
                }`}
              >
                {q}
              </button>
            ))}
          </div>

          <div className="text-sm text-zinc-500">
            {current ? (
              <>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {current.itemCount} track
                  {current.itemCount === 1 ? "" : "s"}
                </span>
                {" · "}
                {current.sizeRange
                  ? `${formatBytes(current.sizeRange.min)} – ${formatBytes(current.sizeRange.max)}`
                  : formatBytes(current.estimatedSize)}
                {current.overCapCount > 0 && (
                  <span className="block text-xs mt-1">
                    {current.overCapCount} more not queued — {current.maxItems}{" "}
                    tracks max per download.
                  </span>
                )}
                {current.skippedCount > 0 && (
                  <span className="block text-xs mt-1">
                    {current.skippedCount} skipped — too long, or no fixed
                    duration.
                  </span>
                )}
              </>
            ) : (
              "Estimating…"
            )}
          </div>

          <button
            onClick={start}
            disabled={!current || current.itemCount === 0}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            Start download
          </button>
        </>
      )}

      {jobId && (
        <div className="space-y-3">
          <div className="flex justify-between text-xs text-zinc-500">
            <span className="capitalize">{state}</span>
            <span className="tabular-nums">
              {doneCount}
              {current ? ` / ${current.itemCount}` : ""} · {progress}%
            </span>
          </div>
          <div className="h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>

          {running && (
            <p className="text-xs text-zinc-500">
              Tracks are transcoded one at a time — you can leave this page and
              come back.
            </p>
          )}

          {state === "completed" && (
            <button
              onClick={saveArchive}
              className="inline-block px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              Save {doneCount} track{doneCount === 1 ? "" : "s"} (.zip)
            </button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
