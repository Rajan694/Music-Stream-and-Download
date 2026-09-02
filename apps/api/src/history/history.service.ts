import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@music/db';

@Injectable()
export class HistoryService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Upserts a played song into the user's history.
   * Merge rule per §24: newest playedAt wins.
   */
  async addRecentSong(
    userId: string,
    data: {
      videoId: string;
      title: string;
      uploaderName: string;
      thumbnailUrl?: string;
      duration: number;
      playedAt: string;
    },
  ) {
    const existing = await this.prisma.recentSong.findUnique({
      where: { userId_videoId: { userId, videoId: data.videoId } },
    });

    if (existing && existing.playedAt > new Date(data.playedAt)) {
      // Server has a newer record, skip
      return existing;
    }

    if (existing) {
      return this.prisma.recentSong.update({
        where: { userId_videoId: { userId, videoId: data.videoId } },
        data: {
          title: data.title,
          uploaderName: data.uploaderName,
          thumbnailUrl: data.thumbnailUrl,
          duration: data.duration,
          playedAt: new Date(data.playedAt),
        },
      });
    }

    return this.prisma.recentSong.create({
      data: {
        userId,
        ...data,
        playedAt: new Date(data.playedAt),
      },
    });
  }

  /** Batch sync on login — §24 no-op for older entries */
  async syncBatch(
    userId: string,
    items: Array<{
      videoId: string;
      title: string;
      uploaderName: string;
      thumbnailUrl?: string;
      duration: number;
      playedAt: string;
    }>,
  ) {
    const results = [];
    for (const item of items) {
      results.push(await this.addRecentSong(userId, item));
    }
    return results;
  }

  async listRecent(userId: string, limit = 50) {
    return this.prisma.recentSong.findMany({
      where: { userId },
      orderBy: { playedAt: 'desc' },
      take: limit,
    });
  }
}
