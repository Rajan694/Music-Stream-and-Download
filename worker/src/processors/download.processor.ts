import { Job } from "bullmq";
import type { PrismaClient } from "@music/db";
import { type DownloadJobPayload } from "@music/shared";
import { JobStore } from "../queue/job-store.js";
import { processDownload, QueueError } from "../pipeline/process-download.js";
import { join } from "node:path";

/**
 * Built once against the worker's Prisma singleton. A client per job would
 * open a connection pool for every download the worker picks up.
 *
 * `processDownload` enforces JOB_TIMEOUT_MS itself by killing the ffmpeg tree,
 * so there is no second timeout to manage here.
 */
export function createDownloadProcessor(prisma: PrismaClient, store: JobStore) {
  async function loadJob(jobId: string) {
    const dbJob = await prisma.downloadJob.findUnique({
      where: { id: jobId },
      include: { items: { orderBy: { position: "asc" } } },
    });
    if (!dbJob) throw new QueueError("DOWNLOAD_FAILED", `Job ${jobId} not found`);
    return dbJob;
  }

  async function processSingleJob(jobId: string) {
    const dbJob = await loadJob(jobId);

    if (!dbJob.videoId) {
      // Unprocessable rather than retryable — fail it instead of burning
      // every attempt on a job that can never resolve.
      await store.fail(jobId, "DOWNLOAD_FAILED");
      return;
    }

    await store.setState(jobId, "downloading");

    // A throw here leaves the row mid-flight while BullMQ still has attempts
    // left; the worker's `failed` handler writes the terminal state once they
    // run out.
    const result = await processDownload(
      {
        id: jobId,
        dirKey: jobId,
        videoId: dbJob.videoId,
        title: dbJob.title,
        format: dbJob.format,
        quality: dbJob.quality,
      },
      async (percent) => {
        const state =
          percent < 5 ? "resolving" : percent >= 100 ? "completed" : "transcoding";
        await store.setProgress(jobId, Math.round(percent), state);
      },
    );

    await store.complete(jobId, result.filePath, result.fileSize);
  }

  /**
   * Tracks run in order. WORKER_CONCURRENCY governs how many *jobs* run at
   * once — fanning a fifty-track playlist out in parallel would let one
   * request monopolise the box. A failed track is recorded on its own row and
   * the run continues.
   */
  async function processPlaylistJob(jobId: string) {
    const dbJob = await loadJob(jobId);

    const total = dbJob.items.length;
    let completed = 0;
    let totalBytes = 0;

    await store.setState(jobId, "downloading");

    for (const item of dbJob.items) {
      try {
        await store.setItemProgress(item.id, 0, "resolving");

        const result = await processDownload(
          {
            id: jobId,
            dirKey: join(jobId, item.id),
            videoId: item.videoId,
            title: item.title,
            format: dbJob.format,
            quality: dbJob.quality,
          },
          async (percent) => {
            await store.setItemProgress(
              item.id,
              Math.round(percent),
              percent >= 100 ? "completed" : "transcoding",
            );
            // Whole tracks finished plus the fraction of the current one, so
            // the parent bar still moves during a long track.
            const overall = ((completed + percent / 100) / total) * 100;
            await store.setProgress(jobId, Math.round(overall), "downloading");
          },
        );

        await store.completeItem(item.id, result.filePath, result.fileSize);
        completed++;
        totalBytes += result.fileSize;
      } catch (err) {
        const code = err instanceof QueueError ? err.code : "DOWNLOAD_FAILED";
        console.error(
          `Playlist ${jobId} track ${item.videoId} failed:`,
          err instanceof Error ? err.message : err,
        );
        await store.failItem(item.id, code);
      }
    }

    await store.completePlaylist(jobId, totalBytes, completed > 0);
    console.info(`Playlist job ${jobId}: ${completed}/${total} track(s) completed`);
  }

  return async function downloadProcessor(job: Job<DownloadJobPayload>) {
    const { jobId, kind } = job.data;
    if (kind === "playlist") {
      await processPlaylistJob(jobId);
    } else {
      await processSingleJob(jobId);
    }
  };
}
