import type { PrismaClient } from "@music/db";

/** One track of a claimed playlist job. */
export interface ClaimedItem {
  id: string;
  videoId: string;
  title: string;
  position: number;
}

/** A job claimed from the queue, ready for processing. */
export interface ClaimedJob {
  id: string;
  /** "video" | "playlist" — decides which pipeline the worker runs. */
  kind: string;
  /** Null on a playlist job; the tracks are in `items`. */
  videoId: string | null;
  title: string;
  format: string;
  quality: string;
  items: ClaimedItem[];
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

  // ── Playlist items ─────────────────────────────────────────────────────────
  /** Update one track's progress and state. */
  setItemProgress(
    itemId: string,
    progress: number,
    state?: string,
  ): Promise<void>;
  /** Mark one track done, recording where its bytes landed. */
  completeItem(
    itemId: string,
    filePath: string,
    fileSize: number,
  ): Promise<void>;
  /** Mark one track failed without sinking the rest of the playlist. */
  failItem(itemId: string, errorCode: string): Promise<void>;
  /**
   * Close out a playlist parent once every track is terminal. Completed if any
   * track produced a file, failed only if none did.
   */
  completePlaylist(
    jobId: string,
    totalBytes: number,
    anyCompleted: boolean,
  ): Promise<void>;
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
      const job = await tx.downloadJob.findUnique({
        where: { id: jobId },
        include: { items: { orderBy: { position: "asc" } } },
      });
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
      kind: claimed.kind ?? "video",
      videoId: claimed.videoId,
      title: claimed.title,
      format: claimed.format,
      quality: claimed.quality,
      items: claimed.items.map((item) => ({
        id: item.id,
        videoId: item.videoId,
        title: item.title,
        position: item.position,
      })),
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

  // ── Playlist items ─────────────────────────────────────────────────────────

  async setItemProgress(
    itemId: string,
    progress: number,
    state?: string,
  ): Promise<void> {
    await this.prisma.downloadItem.update({
      where: { id: itemId },
      data: { progress, state: state ?? undefined, updatedAt: new Date() },
    });
  }

  async completeItem(
    itemId: string,
    filePath: string,
    fileSize: number,
  ): Promise<void> {
    await this.prisma.downloadItem.update({
      where: { id: itemId },
      data: {
        state: "completed",
        progress: 100,
        filePath,
        fileSize,
        updatedAt: new Date(),
      },
    });
  }

  async failItem(itemId: string, errorCode: string): Promise<void> {
    await this.prisma.downloadItem.update({
      where: { id: itemId },
      data: { state: "failed", errorCode, updatedAt: new Date() },
    });
  }

  async completePlaylist(
    jobId: string,
    totalBytes: number,
    anyCompleted: boolean,
  ): Promise<void> {
    await this.prisma.downloadJob.update({
      where: { id: jobId },
      data: {
        // A playlist where every track failed is a failed playlist; one that
        // produced anything is completed, and the per-item errorCode carries
        // the detail for whatever did not.
        state: anyCompleted ? "completed" : "failed",
        errorCode: anyCompleted ? null : "DOWNLOAD_FAILED",
        progress: 100,
        // filePath stays null: the archive is streamed from the items on
        // demand, so there is no single artifact to point at.
        fileSize: totalBytes,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }
}
