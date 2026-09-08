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

async function ensureJobDir(dirKey: string, baseDir: string): Promise<string> {
  const dir = join(baseDir, dirKey);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function cleanup(jobDir: string): Promise<void> {
  try {
    await rm(jobDir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

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

type YtDlpPayload = Record<string, any>;

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

async function resolveAudioUrl(videoId: string): Promise<{
  url: string;
  codec?: string;
  ext?: string;
  duration?: number;
  title: string;
}> {
  const binary = findYtDlpPath();

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

function guardDuration(duration: number | undefined, maxSeconds: number): void {
  if (duration && duration > maxSeconds) {
    throw new QueueError(
      ErrorCode.DOWNLOAD_TOO_LONG,
      `Duration ${duration}s exceeds limit ${maxSeconds}s`,
    );
  }
}

export class QueueError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "QueueError";
  }
}

export async function processDownload(
  job: {
    id: string;
    videoId: string;
    title: string;
    format: string;
    quality: string;
    dirKey?: string;
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
  const jobDir = await ensureJobDir(job.dirKey ?? job.id, baseDir);

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

    await onProgress(5);

    const canCopy =
      format === "webm" && (source.codec ?? "").toLowerCase().includes("opus");

    const args = [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-protocol_whitelist",
      "http,https,tcp,tls,crypto",
      "-i",
      source.url,
      ...(canCopy ? ["-vn", "-c:a", "copy"] : profileArgs(format, quality)),
      "-fs",
      String(maxSizeBytes + 1),
      "-progress",
      "pipe:1",
      "-nostats",
      outPath,
    ];

    const child = spawn(ffmpegPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    trackers.add(child);

    let timedOut = false;
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      killTree("SIGKILL");
    }, hardTimeoutMs);

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
    await cleanup(jobDir);
    throw err;
  } finally {
    clearTimeout(timeoutHandle);
  }
}