import { useEffect, useRef, useState } from "react";
import { MdClose } from "react-icons/md";
import type { Track } from "@music/shared";
import { usePlayerStore } from "../../stores/player.store";
import { useAuthStore } from "../../stores/auth.store";
import { usePreferencesStore } from "../../stores/preferences.store";
import { apiClient } from "../../lib/api";
import { saveCompletedDownload } from "../../lib/downloads-save";

declare global {
  var openDownloadDialog: ((track?: Track) => void) | undefined;
}

const FORMATS = ["mp3", "webm", "ogg"] as const;
const QUALITIES = ["low", "medium", "high"] as const;

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "Size unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DownloadDialog() {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  // Progress trackers outlive the dialog: closing it detaches the UI (see
  // closeDialog) but the job keeps running and still saves itself on completion.
  const attachedJobRef = useRef<string | null>(null);
  const sourcesRef = useRef(new Set<EventSource>());
  const timersRef = useRef(new Set<ReturnType<typeof setInterval>>());

  const playingTrack = usePlayerStore((s) => s.currentTrack);
  const [target, setTarget] = useState<Track | null>(null);
  const currentTrack = target ?? playingTrack;

  const defaultFormat = usePreferencesStore((s) => s.defaultFormat);
  const defaultQuality = usePreferencesStore((s) => s.defaultQuality);

  const [format, setFormat] = useState<"mp3" | "webm" | "ogg">(defaultFormat);
  const [quality, setQuality] = useState<"low" | "medium" | "high">(defaultQuality);
  const [estimate, setEstimate] = useState<{
    estimatedSize: number | null;
    exact?: boolean;
    sizeRange?: { min: number; max: number };
  } | null>(null);
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<
    "idle" | "estimating" | "downloading" | "completed" | "failed"
  >("idle");
  const [error, setError] = useState("");

  const estimateSize = async (track: Track | null = currentTrack) => {
    if (!track) return;
    setState("estimating");
    try {
      const est = await apiClient.estimateDownload(track.id, format, quality);
      setEstimate(est);
      setState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Estimate failed");
      setState("idle");
    }
  };

  useEffect(() => {
    if (state === "idle" && dialogRef.current?.open) {
      void estimateSize();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, quality]);

  const startDownload = async () => {
    if (!currentTrack) return;
    setState("downloading");
    setProgress(0);
    setError("");

    try {
      const job = await apiClient.createDownload(
        currentTrack.id,
        format,
        quality,
      );
      attachedJobRef.current = job.id;
      trackProgress(job.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start download");
      setState("failed");
    }
  };

  useEffect(() => {
    const sources = sourcesRef.current;
    const timers = timersRef.current;
    return () => {
      sources.forEach((es) => es.close());
      timers.forEach((handle) => clearInterval(handle));
    };
  }, []);

  const isAttached = (jobId: string) => attachedJobRef.current === jobId;

  const onJobDone = (jobId: string) => {
    void saveCompletedDownload(jobId);
    if (isAttached(jobId)) setState("completed");
  };

  const onJobFailed = (jobId: string, errorCode: string | null) => {
    if (!isAttached(jobId)) return;
    setError(errorCode || "Download failed");
    setState("failed");
  };

  const trackProgress = (jobId: string) => {
    const token = useAuthStore.getState().accessToken;
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1";

    if (token) {
      const es = new EventSource(
        `${API_URL}/downloads/${jobId}/events?token=${token}`,
      );
      sourcesRef.current.add(es);

      const close = () => {
        es.close();
        sourcesRef.current.delete(es);
      };

      es.onmessage = (ev) => {
        const data = JSON.parse(ev.data);
        if (isAttached(jobId)) setProgress(data.progress ?? 0);
        if (data.state === "completed") {
          close();
          onJobDone(jobId);
        } else if (["failed", "cancelled"].includes(data.state)) {
          close();
          onJobFailed(jobId, data.errorCode);
        }
      };
      es.onerror = () => {
        close();
        pollJob(jobId);
      };
      return;
    }

    pollJob(jobId);
  };

  const pollJob = (jobId: string) => {
    const handle = setInterval(async () => {
      const stop = () => {
        clearInterval(handle);
        timersRef.current.delete(handle);
      };

      try {
        const job = await apiClient.getDownload(jobId);
        if (isAttached(jobId)) setProgress(job.progress);
        if (job.state === "completed") {
          stop();
          onJobDone(jobId);
        } else if (["failed", "cancelled"].includes(job.state)) {
          stop();
          onJobFailed(jobId, job.errorCode);
        }
      } catch {
        stop();
        onJobFailed(jobId, "Lost connection to download");
      }
    }, 2000);
    timersRef.current.add(handle);
  };

  // Detaches the UI from any in-flight job without stopping it, so reopening the
  // dialog for another track starts clean while the old download keeps going.
  const closeDialog = () => {
    attachedJobRef.current = null;
    dialogRef.current?.close();
  };

  const openDialog = (track?: Track) => {
    const d = dialogRef.current;
    if (!d || d.open) return;

    attachedJobRef.current = null;
    setTarget(track ?? null);

    const prefs = usePreferencesStore.getState();
    setFormat(prefs.defaultFormat);
    setQuality(prefs.defaultQuality);

    setState("idle");
    setProgress(0);
    setError("");
    setEstimate(null);
    d.showModal();
    void estimateSize(track ?? playingTrack);
  };

  const openDialogRef = useRef(openDialog);
  useEffect(() => {
    openDialogRef.current = openDialog;
  });

  useEffect(() => {
    globalThis.openDownloadDialog = (track?: Track) =>
      openDialogRef.current(track);
    return () => {
      globalThis.openDownloadDialog = undefined;
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      // Tailwind's preflight zeroes every margin, which kills the `margin: auto`
      // the UA stylesheet uses to centre a modal dialog — hence the explicit
      // `fixed inset-0 m-auto h-fit`.
      onClose={() => {
        attachedJobRef.current = null;
      }}
      className="fixed inset-0 m-auto h-fit max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 shadow-2xl w-[calc(100%-2rem)] max-w-md p-0 backdrop:bg-black/50 open:block"
    >
      <div className="p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold">Download</h3>
            <p className="text-sm text-zinc-500 mt-1 line-clamp-1">
              {currentTrack?.title}
            </p>
          </div>
          <button
            onClick={closeDialog}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            aria-label="Close"
          >
            <MdClose className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Format
          </label>
          <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup">
            {FORMATS.map((f) => (
              <button
                key={f}
                role="radio"
                aria-checked={format === f}
                onClick={() => setFormat(f)}
                className={`py-2 rounded-lg border text-sm font-medium transition-colors ${
                  format === f
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300"
                }`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Quality
          </label>
          <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup">
            {QUALITIES.map((q) => (
              <button
                key={q}
                role="radio"
                aria-checked={quality === q}
                onClick={() => setQuality(q)}
                className={`py-2 rounded-lg border text-sm font-medium capitalize transition-colors ${
                  quality === q
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300"
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-500">Estimated size</span>
          <span className="font-semibold tabular-nums">
            {state === "estimating"
              ? "…"
              : estimate?.sizeRange
                ? `${formatBytes(estimate.sizeRange.min)} – ${formatBytes(estimate.sizeRange.max)}`
                : formatBytes(estimate?.estimatedSize ?? null)}
          </span>
        </div>

        {state === "downloading" && (
          <div>
            <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
              <span>Processing…</span>
              <span className="tabular-nums">{progress}%</span>
            </div>
            <div className="h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              Closing this dialog keeps the download running — the file saves
              itself when it's ready.
            </p>
          </div>
        )}

        {state === "completed" && (
          <div className="text-sm text-green-600 dark:text-green-400 font-medium">
            Download complete — saving to your device
          </div>
        )}
        {state === "failed" && error && (
          <div className="text-sm text-red-500 font-medium">{error}</div>
        )}

        <div className="flex gap-3 pt-2">
          {state === "completed" ? (
            <button
              onClick={closeDialog}
              className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={closeDialog}
                className="flex-1 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                {state === "downloading" ? "Close" : "Cancel"}
              </button>
              <button
                onClick={startDownload}
                disabled={state === "estimating" || state === "downloading"}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {state === "downloading" ? "Downloading…" : "Download"}
              </button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}