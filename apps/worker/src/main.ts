import { setTimeout as delay } from "node:timers/promises";
import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { createPrismaClient } from "@music/db";
import { PostgresJobQueue } from "./queue/job-queue.js";
import type { ClaimedJob, JobQueue } from "./queue/job-queue.js";
import { processDownload, QueueError } from "./pipeline/process-download.js";

const POLL_INTERVAL_MS = Number(process.env.JOB_POLL_INTERVAL_MS ?? 2000);
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 2);
const CLEANUP_INTERVAL_MS = 30 * 60_000; // 30 minutes

/**
 * On startup and periodically, sweep the temp directory for orphaned job
 * folders. A folder is orphaned when no DownloadJob row references it and
 * the folder is older than 1 hour (to avoid deleting in-flight work).
 */
type Prisma = ReturnType<typeof createPrismaClient>;

async function cleanupOrphanTempFiles(prisma: Prisma): Promise<void> {
  const baseDir =
    process.env.MEDIA_TEMP_DIR ||
    process.env.WORKER_MEDIA_TEMP_DIR ||
    "/tmp/music-media";

  let entries: string[];
  try {
    entries = await readdir(baseDir);
  } catch {
    // Directory doesn't exist yet — nothing to clean.
    return;
  }

  const now = Date.now();
  const ONE_HOUR = 60 * 60_000;

  // Collect active job IDs from the DB (queued, resolving, transcoding).
  const activeIds = new Set(
    (
      await prisma.downloadJob.findMany({
        where: {
          state: { in: ["queued", "resolving", "downloading", "transcoding"] },
        },
        select: { id: true },
      })
    ).map((job: { id: string }) => job.id),
  );

  let cleaned = 0;
  for (const entry of entries) {
    if (activeIds.has(entry)) continue;

    const dirPath = join(baseDir, entry);
    try {
      const info = await stat(dirPath);
      if (!info.isDirectory()) continue;
      if (now - info.mtimeMs < ONE_HOUR) continue; // still young — might be in-flight

      await rm(dirPath, { recursive: true, force: true });
      cleaned++;

      // Directory names are job ids. Clearing filePath keeps the row honest:
      // otherwise a completed job keeps advertising a download whose bytes are
      // gone, and the API hands the client a stream that cannot open.
      await prisma.downloadJob.updateMany({
        where: { id: entry, filePath: { not: null } },
        data: { filePath: null },
      });

      // Playlist tracks live inside the parent's directory, so the same sweep
      // took their bytes too.
      await prisma.downloadItem.updateMany({
        where: { jobId: entry, filePath: { not: null } },
        data: { filePath: null },
      });
    } catch {
      // best-effort
    }
  }

  if (cleaned > 0) {
    console.info(`Cleaned ${cleaned} orphaned temp dir(s)`);
  }
}

/**
 * Runs every track of a playlist job in order.
 *
 * Sequential on purpose: `WORKER_CONCURRENCY` governs how many *jobs* run at
 * once, and fanning a fifty-track playlist out in parallel would let one
 * request monopolise the box and every other user's download behind it.
 *
 * A failed track is recorded on its own row and the run continues — one dead
 * video must not cost the other forty-nine.
 */
async function processPlaylistJob(
  job: ClaimedJob,
  queue: JobQueue,
): Promise<void> {
  const total = job.items.length;
  let completed = 0;
  let totalBytes = 0;

  await queue.setState(job.id, "downloading");

  for (const item of job.items) {
    try {
      await queue.setItemProgress(item.id, 0, "resolving");

      const result = await processDownload(
        {
          id: job.id,
          dirKey: join(job.id, item.id),
          videoId: item.videoId,
          title: item.title,
          format: job.format,
          quality: job.quality,
        },
        async (percent) => {
          await queue.setItemProgress(
            item.id,
            Math.round(percent),
            percent >= 100 ? "completed" : "transcoding",
          );
          // Whole tracks finished plus the fraction of the current one, so the
          // parent bar still moves during a long track.
          const overall = ((completed + percent / 100) / total) * 100;
          await queue.setProgress(job.id, Math.round(overall), "downloading");
        },
      );

      await queue.completeItem(item.id, result.filePath, result.fileSize);
      completed++;
      totalBytes += result.fileSize;
    } catch (err) {
      const code = err instanceof QueueError ? err.code : "DOWNLOAD_FAILED";
      console.error(
        `Playlist ${job.id} track ${item.videoId} failed:`,
        err instanceof Error ? err.message : err,
      );
      await queue.failItem(item.id, code);
    }
  }

  await queue.completePlaylist(job.id, totalBytes, completed > 0);
  console.info(
    `Playlist job ${job.id}: ${completed}/${total} track(s) completed`,
  );
}

async function main(): Promise<void> {
  const controller = new AbortController();
  const prisma = createPrismaClient();
  const queue = new PostgresJobQueue(prisma);

  const shutdown = (signal: string) => {
    console.info(`Worker received ${signal}, shutting down`);
    controller.abort();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // ── Orphan cleanup on startup ──────────────────────────────────────────────
  await cleanupOrphanTempFiles(prisma).catch((err) => {
    console.error("Startup orphan cleanup failed:", err);
  });

  console.info("Worker ready — polling for jobs");

  const processOne = async () => {
    let job: Awaited<ReturnType<typeof queue.claimNext>>;
    try {
      job = await queue.claimNext();
    } catch (err) {
      console.error("Failed to claim job:", err);
      return;
    }
    if (!job) return;

    if (job.kind === "playlist") {
      console.info(
        `Processing playlist job ${job.id} (${job.items.length} tracks, ${job.format}/${job.quality})`,
      );
      try {
        await processPlaylistJob(job, queue);
      } catch (err) {
        console.error(`Playlist job ${job.id} failed:`, err);
        await queue.fail(job.id, "DOWNLOAD_FAILED");
      }
      return;
    }

    if (!job.videoId) {
      // A non-playlist job with no video is unprocessable rather than
      // retryable; fail it instead of re-claiming it on every poll.
      console.error(`Job ${job.id} has no videoId — failing`);
      await queue.fail(job.id, "DOWNLOAD_FAILED");
      return;
    }
    const videoId = job.videoId;

    console.info(
      `Processing job ${job.id} (${videoId}, ${job.format}/${job.quality})`,
    );

    try {
      await processDownload({ ...job, videoId }, async (percent) => {
        const state =
          percent < 5
            ? "resolving"
            : percent >= 100
              ? "completed"
              : "transcoding";
        await queue.setProgress(job.id, Math.round(percent), state);
      }).then(async (result) => {
        await queue.complete(job.id, result.filePath, result.fileSize);
      });
      console.info(`Completed job ${job.id}`);
    } catch (err) {
      const code = err instanceof QueueError ? err.code : "DOWNLOAD_FAILED";
      console.error(
        `Job ${job.id} failed:`,
        err instanceof Error ? err.message : err,
      );
      await queue.fail(job.id, code);
    }
  };

  // ── Periodic orphan cleanup timer ──────────────────────────────────────────
  const cleanupTimer = setInterval(() => {
    void cleanupOrphanTempFiles(prisma).catch((err) => {
      console.error("Periodic orphan cleanup failed:", err);
    });
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();

  while (!controller.signal.aborted) {
    // Claim and process up to CONCURRENCY jobs in parallel per cycle.
    const batch: Promise<void>[] = [];
    for (let i = 0; i < CONCURRENCY; i++) {
      if (controller.signal.aborted) break;
      batch.push(processOne());
    }
    await Promise.allSettled(batch);

    try {
      await delay(POLL_INTERVAL_MS, undefined, { signal: controller.signal });
    } catch {
      break;
    }
  }

  clearInterval(cleanupTimer);
  // In-flight jobs are awaited within the loop batch; disconnect cleanly.
  await prisma.$disconnect();
  console.info("Worker stopped");
}

await main();
