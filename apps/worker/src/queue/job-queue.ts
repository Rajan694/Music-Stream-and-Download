import type { PrismaClient } from "@music/db";

/** A job claimed from the queue, ready for processing. */
export interface ClaimedJob {
  id: string;
  videoId: string;
  title: string;
  format: string;
  quality: string;
}

/**
 * Minimal queue abstraction so BullMQ can drop in later (Phase 2 transport,
 * M4). The MVP uses a Postgres table polled with `FOR UPDATE SKIP LOCKED`.
 */
export interface JobQueue {
  /** Atomically claim the next queued job, or null if the queue is empty. */
  claimNext(): Promise<ClaimedJob | null>;
  /** Mark a job as failed. */
  fail(jobId: string, errorCode: string): Promise<void>;
  /** Mark a job as completed with its output details. */
  complete(jobId: string, filePath: string, fileSize: number): Promise<void>;
  /** Update progress (0-100). */
  setProgress(jobId: string, progress: number, state?: string): Promise<void>;
  /** Set state (used to signal resolving/downloading/transcoding). */
  setState(jobId: string, state: string): Promise<void>;
}

/** Postgres-backed implementation using `FOR UPDATE SKIP LOCKED`. */
export class PostgresJobQueue implements JobQueue {
  constructor(private prisma: PrismaClient) {}

  async claimNext(): Promise<ClaimedJob | null> {
    // Transactionally lock the next queued job and move it to "resolving".
    const claimed = await this.prisma.$transaction(async (tx) => {
      const jobs = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM "DownloadJob"
        WHERE state = 'queued'
        ORDER BY "createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;
      if (!jobs || jobs.length === 0) return null;

      const jobId = jobs[0].id;
      const job = await tx.downloadJob.findUnique({ where: { id: jobId } });
      if (!job) return null;

      await tx.downloadJob.update({
        where: { id: jobId },
        data: { state: "resolving" },
      });
      return job;
    });

    if (!claimed) return null;
    return {
      id: claimed.id,
      videoId: claimed.videoId,
      title: claimed.title,
      format: claimed.format,
      quality: claimed.quality,
    };
  }

  async fail(jobId: string, errorCode: string): Promise<void> {
    await this.prisma.downloadJob.update({
      where: { id: jobId },
      data: { state: "failed", errorCode, updatedAt: new Date() },
    });
  }

  async complete(
    jobId: string,
    filePath: string,
    fileSize: number,
  ): Promise<void> {
    await this.prisma.downloadJob.update({
      where: { id: jobId },
      data: {
        state: "completed",
        progress: 100,
        filePath,
        fileSize,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  async setProgress(
    jobId: string,
    progress: number,
    state?: string,
  ): Promise<void> {
    await this.prisma.downloadJob.update({
      where: { id: jobId },
      data: {
        progress,
        state: state ?? undefined,
        updatedAt: new Date(),
      },
    });
  }

  async setState(jobId: string, state: string): Promise<void> {
    await this.prisma.downloadJob.update({
      where: { id: jobId },
      data: { state, updatedAt: new Date() },
    });
  }
}
