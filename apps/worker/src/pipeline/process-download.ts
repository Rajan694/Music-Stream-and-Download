import { spawn } from "node:child_process";
import { mkdir, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { buildCleanFilename, ErrorCode } from "@music/shared";
import type { AudioFormat, AudioQuality } from "@music/shared";
import { FORMAT_EXTENSION, profileArgs } from "../media/profiles.js";

export interface DownloadResult {
  filePath: string;
  fileSize: number;
}

/** Ensure per-job isolated temp directory and return its path. */
async function ensureJobDir(jobId: string, baseDir: string): Promise<string> {
  const dir = join(baseDir, jobId);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Clean up the isolated temp dir on every path. */
async function cleanup(jobDir: string): Promise<void> {
  try {
    await rm(jobDir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

/** Locate the yt-dlp binary: env override, then the vendored youtube-dl-exec build. */
export function findYtDlpPath(): string {
  if (process.env.YT_DLP_PATH) return process.env.YT_DLP_PATH;
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve("youtube-dl-exec/package.json");
    const binary = join(dirname(pkgPath), "bin", "yt-dlp");
    if (existsSync(binary)) return binary;
  } catch {
    // fall through to PATH lookup
  }
  return "yt-dlp";
}

/** Raw yt-dlp JSON. Loose by nature; it never escapes this module. */
type YtDlpPayload = Record<string, any>;

/** Spawn yt-dlp with --dump-single-json and return the parsed payload. */
function runYtDlp(
  binary: string,
  args: string[],
  timeoutMs: number,
): Promise<YtDlpPayload> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        reject(new Error("yt-dlp timed out"));
      }
    }, timeoutMs);

    child.stdout.on("data", (c) => (stdout += c.toString()));
    child.stderr.on("data", (c) => (stderr += c.toString()));
    child.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`yt-dlp exited ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("yt-dlp returned invalid JSON"));
      }
    });
  });
}

/** Resolve the best direct audio stream URL via yt-dlp. */
async function resolveAudioUrl(videoId: string): Promise<{
  url: string;
  codec?: string;
  ext?: string;
  duration?: number;
  title: string;
}> {
  const binary = findYtDlpPath();

  // `--no-check-certificates` is deliberately absent: disabling TLS
  // verification would make every resolve trivially interceptable.
  const data: YtDlpPayload = await runYtDlp(
    binary,
    [
      "--dump-single-json",
      "--no-warnings",
      "--prefer-free-formats",
      "--youtube-skip-dash-manifest",
      "--format",
      "bestaudio/best",
      `https://www.youtube.com/watch?v=${videoId}`,
    ],
    Number(process.env.RESOLVE_TIMEOUT_MS ?? 60_000),
  );

  const formats = data?.requested_formats ?? data?.formats ?? [];
  // Prefer a direct audio-only format; fall back to the first format with audio.
  const selected =
    formats.find(
      (f: YtDlpPayload) => f.acodec !== "none" && f.vcodec === "none",
    ) ?? formats.find((f: YtDlpPayload) => f.acodec !== "none");

  return {
    url: selected?.url ?? data?.url,
    codec: selected?.acodec ?? data?.acodec,
    ext: selected?.ext ?? data?.ext,
    duration: data?.duration,
    title: data?.title ?? videoId,
  };
}

/**
 * Guard: reject jobs over MAX_DOWNLOAD_DURATION before starting.
 */
function guardDuration(duration: number | undefined, maxSeconds: number): void {
  if (duration && duration > maxSeconds) {
    throw new QueueError(
      ErrorCode.DOWNLOAD_TOO_LONG,
      `Duration ${duration}s exceeds limit ${maxSeconds}s`,
    );
  }
}

/** Custom error carrying an error code for job failure state. */
export class QueueError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "QueueError";
  }
}

/**
 * Runs the § pipeline for a single job:
 *   resolve → select audio stream → pipe source into FFmpeg stdin → encode → write
 * with guards, size overrun kill, hard timeout, and cleanup-on-every-path.
 *
 * @param onProgress callback reporting progress 0-100 while encoding.
 */
export async function processDownload(
  job: {
    id: string;
    videoId: string;
    title: string;
    format: string;
    quality: string;
  },
  onProgress: (percent: number) => Promise<void> | void,
): Promise<DownloadResult> {
  const format = job.format as AudioFormat;
  const quality = job.quality as AudioQuality;
  const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
  const baseDir =
    process.env.MEDIA_TEMP_DIR ||
    process.env.WORKER_MEDIA_TEMP_DIR ||
    "/tmp/music-media";
  const jobDir = await ensureJobDir(job.id, baseDir);

  // Kill handles for the process tree on timeout / size overrun.
  const trackers = new Set<{
    kill: (signal: NodeJS.Signals | "SIGKILL") => unknown;
  }>();

  const hardTimeoutMs = Number(process.env.JOB_TIMEOUT_MS ?? 600_000);
  const maxSizeBytes = Number(process.env.MAX_DOWNLOAD_SIZE ?? 52_428_800);

  let timeoutHandle: NodeJS.Timeout | undefined;

  const killTree = (signal: NodeJS.Signals) => {
    for (const t of trackers) {
      try {
        t.kill(signal);
      } catch {
        /* ignore */
      }
    }
  };

  try {
    // ── 1. Resolve ───────────────────────────────────────────────────────────
    await onProgress(1);
    const source = await resolveAudioUrl(job.videoId);
    guardDuration(
      source.duration,
      Number(process.env.MAX_DOWNLOAD_DURATION ?? 1800),
    );

    const outName = buildCleanFilename(
      source.title || job.title,
      FORMAT_EXTENSION[format],
    );
    const outPath = join(jobDir, outName);

    // ── 2. FFmpeg encode, reading directly from the resolved source ──────────
    await onProgress(5);

    // A WebM request whose source is already Opus needs no encoder: remuxing
    // is near-instant and lossless, where re-encoding would burn CPU and throw
    // away quality for nothing.
    const canCopy =
      format === "webm" && (source.codec ?? "").toLowerCase().includes("opus");

    const args = [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      // The resolved URL always comes from yt-dlp, but restricting protocols
      // keeps a surprising redirect from turning `-i` into a local file read.
      "-protocol_whitelist",
      "http,https,tcp,tls,crypto",
      "-i",
      source.url,
      ...(canCopy ? ["-vn", "-c:a", "copy"] : profileArgs(format, quality)),
      // Stop writing at the limit instead of discovering the overrun after a
      // multi-gigabyte file already exists. A truncated output then fails the
      // check below, so an oversized job still fails — it just cannot fill the
      // disk first. `+1` makes the overrun detectable rather than exactly equal.
      "-fs",
      String(maxSizeBytes + 1),
      // Machine-readable progress on stdout: `-loglevel error` suppresses the
      // human stderr stats line entirely, so parsing stderr reported nothing.
      "-progress",
      "pipe:1",
      "-nostats",
      outPath,
    ];

    const child = spawn(ffmpegPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    trackers.add(child);

    // ── 3. Guards: hard timeout kills the tree ───────────────────────────────
    let timedOut = false;
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      killTree("SIGKILL");
    }, hardTimeoutMs);

    // ── 4. Progress from FFmpeg's -progress stream ───────────────────────────
    // Keyed lines arrive as `out_time_us=12345678`, one block per update.
    let lastReported = 5;
    let stdoutTail = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutTail = (stdoutTail + chunk.toString()).slice(-4096);
      const matches = [...stdoutTail.matchAll(/out_time_us=(\d+)/g)];
      const latest = matches.at(-1);
      if (!latest || !source.duration) return;

      const seconds = Number(latest[1]) / 1_000_000;
      const percent = Math.min(
        95,
        Math.max(5, Math.round((seconds / source.duration) * 100)),
      );
      if (percent > lastReported) {
        lastReported = percent;
        void onProgress(percent);
      }
    });

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < 4096) stderr += chunk.toString();
    });

    const code: number | null = await new Promise((resolve) => {
      child.on("close", (c) => resolve(c));
      child.on("error", () => resolve(1));
    });
    clearTimeout(timeoutHandle);

    if (timedOut) {
      throw new QueueError(
        ErrorCode.JOB_TIMEOUT,
        `Job exceeded ${hardTimeoutMs}ms`,
      );
    }
    if (code !== 0) {
      throw new QueueError(
        ErrorCode.CONVERSION_FAILED,
        `FFmpeg exited with code ${code}: ${stderr.trim().slice(0, 300)}`,
      );
    }

    // ── 5. Size guard on the output ──────────────────────────────────────────
    const { size } = await stat(outPath);
    if (size > maxSizeBytes) {
      throw new QueueError(
        ErrorCode.DOWNLOAD_TOO_LARGE,
        `Output ${size} bytes exceeds limit`,
      );
    }

    onProgress(100);
    return { filePath: outPath, fileSize: size };
  } catch (err) {
    // Never leave the temp dir behind on any path.
    await cleanup(jobDir);
    throw err;
  } finally {
    clearTimeout(timeoutHandle);
  }
}
