import type { PrismaClient } from "@music/db";

export interface ClaimedItem {
  id: string;
  videoId: string;
  title: string;
  position: number;
}

export interface ClaimedJob {
  id: string;
  kind: string;
  videoId: string | null;
  title: string;
  format: string;
  quality: string;
  items: ClaimedItem[];
}

export class JobStore {
  constructor(private prisma: PrismaClient) {}

  async fail(jobId: string, errorCode: string): Promise<void> {
    await this.prisma.downloadJob.update({
      where: { id: jobId },
      data: { state: "failed", errorCode, updatedAt: new Date() },
    });
  }

  async complete(jobId: string, filePath: string, fileSize: number): Promise<void> {
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

  async setProgress(jobId: string, progress: number, state?: string): Promise<void> {
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

  async setItemProgress(itemId: string, progress: number, state?: string): Promise<void> {
    await this.prisma.downloadItem.update({
      where: { id: itemId },
      data: { progress, state: state ?? undefined, updatedAt: new Date() },
    });
  }

  async completeItem(itemId: string, filePath: string, fileSize: number): Promise<void> {
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

  async completePlaylist(jobId: string, totalBytes: number, anyCompleted: boolean): Promise<void> {
    await this.prisma.downloadJob.update({
      where: { id: jobId },
      data: {
        state: anyCompleted ? "completed" : "failed",
        errorCode: anyCompleted ? null : "DOWNLOAD_FAILED",
        progress: 100,
        fileSize: totalBytes,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  async findQueuedJobs(): Promise<string[]> {
    return (await this.prisma.downloadJob.findMany({
      where: { state: "queued" },
      select: { id: true },
    })).map(j => j.id);
  }
}