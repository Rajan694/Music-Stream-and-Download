import { useEffect, useRef, useState } from "react";
import { X, Download, Check, AlertCircle } from "lucide-react";
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
      onClose={() => {
        attachedJobRef.current = null;
      }}
      className="fixed inset-0 m-auto h-fit max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-white/10 bg-background-1/95 backdrop-blur-xl text-zinc-100 shadow-2xl shadow-black/50 w-[calc(100%-2rem)] max-w-md p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm open:block"
    >
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent-primary/10 rounded-xl flex items-center justify-center">
              <Download size={18} className="text-accent-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Download</h3>
              <p className="text-xs text-zinc-400 line-clamp-1">
                {currentTrack?.title}
              </p>
            </div>
          </div>
          <button
            onClick={closeDialog}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500 block mb-2">
            Format
          </label>
          <div className="grid grid-cols-3 gap-1 bg-background-2 p-1 rounded-xl" role="radiogroup">
            {FORMATS.map((f) => (
              <button
                key={f}
                role="radio"
                aria-checked={format === f}
                onClick={() => setFormat(f)}
                className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                  format === f
                    ? "bg-white/10 text-white border border-white/5 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500 block mb-2">
            Quality
          </label>
          <div className="grid grid-cols-3 gap-1 bg-background-2 p-1 rounded-xl" role="radiogroup">
            {QUALITIES.map((q) => (
              <button
                key={q}
                role="radio"
                aria-checked={quality === q}
                onClick={() => setQuality(q)}
                className={`py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                  quality === q
                    ? "bg-white/10 text-white border border-white/5 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs px-1">
          <span className="text-zinc-500">Estimated size</span>
          <span className="font-semibold tabular-nums text-zinc-200">
            {state === "estimating"
              ? "…"
              : estimate?.sizeRange
                ? `${formatBytes(estimate.sizeRange.min)} – ${formatBytes(estimate.sizeRange.max)}`
                : formatBytes(estimate?.estimatedSize ?? null)}
          </span>
        </div>

        {state === "downloading" && (
          <div className="space-y-3 bg-white/5 p-4 rounded-xl border border-white/5">
            <div className="flex justify-between text-xs text-zinc-300">
              <span>Processing…</span>
              <span className="tabular-nums font-semibold">{progress}%</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-accent-primary to-accent-secondary rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Closing this dialog keeps the download running — the file saves
              itself when it's ready.
            </p>
          </div>
        )}

        {state === "completed" && (
          <div className="flex items-center gap-3 bg-emerald-500/10 text-emerald-400 p-4 rounded-xl border border-emerald-500/20">
            <Check size={18} />
            <span className="text-sm font-medium">Download complete — saving to your device</span>
          </div>
        )}
        {state === "failed" && error && (
          <div className="flex items-center gap-3 bg-red-500/10 text-red-400 p-4 rounded-xl border border-red-500/20">
            <AlertCircle size={18} />
            <span className="text-sm font-medium">{error}</span>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          {state === "completed" ? (
            <button
              onClick={closeDialog}
              className="flex-1 py-3 rounded-xl bg-accent-primary text-white font-medium hover:opacity-90 transition-opacity text-sm"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={closeDialog}
                className="flex-1 py-3 rounded-xl border border-white/10 font-medium hover:bg-white/5 transition-colors text-sm text-zinc-300"
              >
                {state === "downloading" ? "Close" : "Cancel"}
              </button>
              <button
                onClick={startDownload}
                disabled={state === "estimating" || state === "downloading"}
                className="flex-1 py-3 rounded-xl bg-accent-primary text-white font-medium hover:opacity-90 disabled:opacity-30 transition-opacity text-sm"
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