import { PrismaClient } from '@music/db';

export class HistoryService {
  constructor(private prisma: PrismaClient) {}

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