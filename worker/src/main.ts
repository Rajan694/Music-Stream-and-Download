// Side-effect import, and it must stay first: it loads the repo .env before
// anything else reads process.env. REDIS_URL in particular has to match the
// backend's, or enqueued jobs are consumed from a different Redis.
import "./config/env.js";

import { Worker, Queue, Job } from "bullmq";
import { createPrismaClient } from "@music/db";
import { DOWNLOADS_QUEUE, type DownloadJobPayload } from "@music/shared";
import { JobStore } from "./queue/job-store.js";
import { createDownloadProcessor } from "./processors/download.processor.js";
import { QueueError } from "./pipeline/process-download.js";
import { cleanupOrphanTempFiles } from "./pipeline/cleanup.js";

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 2);
const CLEANUP_INTERVAL_MS = 30 * 60_000;
const RECONCILE_INTERVAL_MS = 60_000;

const redisUrl = process.env.REDIS_URL || "redis://localhost:6380";
// BullMQ requires maxRetriesPerRequest: null on its blocking connections.
const connection = { url: redisUrl, maxRetriesPerRequest: null };

const prisma = createPrismaClient();
const store = new JobStore(prisma);

const queue = new Queue<DownloadJobPayload>(DOWNLOADS_QUEUE, { connection });

const worker = new Worker<DownloadJobPayload>(
  DOWNLOADS_QUEUE,
  createDownloadProcessor(prisma, store),
  { connection, concurrency: CONCURRENCY, maxStalledCount: 1 },
);

/**
 * Terminal DB state once BullMQ gives up. Without this the row stays mid-flight
 * forever and the client's SSE stream never closes.
 */
worker.on("failed", async (job, err) => {
  if (!job) return;
  const attempts = job.opts.attempts ?? 1;
  if (job.attemptsMade < attempts) return;

  const code = err instanceof QueueError ? err.code : "DOWNLOAD_FAILED";
  try {
    await store.fail(job.data.jobId, code);
  } catch (writeError) {
    console.error(`Failed to record failure for job ${job.data.jobId}:`, writeError);
  }
});

worker.on("error", (err) => console.error("Worker error:", err));

/**
 * Re-enqueues rows that are `queued` in the database but have no BullMQ job —
 * the state left behind when a row is created while Redis is unreachable.
 */
async function reconcileQueuedJobs(): Promise<void> {
  const queuedIds = await store.findQueuedJobs();
  for (const jobId of queuedIds) {
    const existing = await Job.fromId(queue, jobId);
    if (existing) continue;

    const dbJob = await prisma.downloadJob.findUnique({ where: { id: jobId } });
    if (!dbJob) continue;

    const kind = dbJob.kind === "playlist" ? "playlist" : "video";
    await queue.add(kind, { jobId, kind }, { jobId });
    console.info(`Reconciled orphaned job ${jobId}`);
  }
}

await cleanupOrphanTempFiles(prisma).catch((err) =>
  console.error("Startup orphan cleanup failed:", err),
);
await reconcileQueuedJobs().catch((err) =>
  console.error("Startup reconcile failed:", err),
);

console.info(`Worker ready — BullMQ, concurrency ${CONCURRENCY}`);

const cleanupTimer = setInterval(() => {
  void cleanupOrphanTempFiles(prisma).catch((err) =>
    console.error("Periodic orphan cleanup failed:", err),
  );
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();

const reconcileTimer = setInterval(() => {
  void reconcileQueuedJobs().catch((err) =>
    console.error("Periodic reconcile failed:", err),
  );
}, RECONCILE_INTERVAL_MS);
reconcileTimer.unref();

async function shutdown(signal: string): Promise<void> {
  console.info(`Worker received ${signal}, shutting down`);
  clearInterval(cleanupTimer);
  clearInterval(reconcileTimer);
  // Lets in-flight jobs finish rather than orphaning a half-written file.
  await worker.close();
  await queue.close();
  await prisma.$disconnect();
  console.info("Worker stopped");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
