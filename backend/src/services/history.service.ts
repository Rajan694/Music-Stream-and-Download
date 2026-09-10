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

  async recordPlayEvents(
    userId: string,
    events: Array<{
      id: string;
      videoId: string;
      title: string;
      uploaderName: string;
      durationSec: number;
      msPlayed: number;
      completed: boolean;
      source: string;
      clientPlatform: string;
      playedAt: string;
    }>,
  ) {
    const validEvents = events.filter((e) => {
      const durationMs = e.durationSec * 1000;
      const meetsThreshold = e.msPlayed >= 30_000 || (durationMs > 0 && e.msPlayed >= durationMs * 0.5);
      return meetsThreshold;
    });

    if (validEvents.length === 0) {
      return { count: 0 };
    }

    // A 200-event batch is typically a few dozen distinct songs. Collapse to
    // the newest event per video so the RecentSong pass is one write per song
    // instead of one per play — this loop runs inside a transaction, and 200
    // sequential upserts hold row locks far longer than necessary.
    const newestByVideo = new Map<string, (typeof validEvents)[number]>();
    for (const e of validEvents) {
      const seen = newestByVideo.get(e.videoId);
      if (!seen || new Date(e.playedAt) > new Date(seen.playedAt)) {
        newestByVideo.set(e.videoId, e);
      }
    }
    const latest = [...newestByVideo.values()];

    await this.prisma.$transaction(async (tx) => {
      await tx.playEvent.createMany({
        data: validEvents.map((e) => ({
          id: e.id,
          userId,
          videoId: e.videoId,
          title: e.title,
          uploaderName: e.uploaderName,
          durationSec: e.durationSec,
          msPlayed: e.msPlayed,
          completed: e.completed,
          source: e.source,
          clientPlatform: e.clientPlatform,
          playedAt: new Date(e.playedAt),
        })),
        skipDuplicates: true,
      });

      // Offline plays sync late by design, so a batch routinely carries events
      // older than what RecentSong already holds. Without this guard a
      // three-day-old event overwrites a newer "recently played" entry.
      const existing = await tx.recentSong.findMany({
        where: { userId, videoId: { in: latest.map((e) => e.videoId) } },
        select: { videoId: true, playedAt: true },
      });
      const currentPlayedAt = new Map(existing.map((r) => [r.videoId, r.playedAt]));

      for (const e of latest) {
        const playedAt = new Date(e.playedAt);
        const known = currentPlayedAt.get(e.videoId);
        if (known && known >= playedAt) continue;

        await tx.recentSong.upsert({
          where: { userId_videoId: { userId, videoId: e.videoId } },
          update: {
            title: e.title,
            uploaderName: e.uploaderName,
            duration: e.durationSec,
            playedAt,
          },
          create: {
            userId,
            videoId: e.videoId,
            title: e.title,
            uploaderName: e.uploaderName,
            duration: e.durationSec,
            playedAt,
          },
        });
      }
    });

    return { count: validEvents.length };
  }
}