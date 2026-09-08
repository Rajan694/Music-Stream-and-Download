import { PrismaClient } from '@music/db';

export class PlaylistsService {
  constructor(private prisma: PrismaClient) {}

  async pin(
    userId: string,
    data: {
      playlistId: string;
      title: string;
      thumbnailUrl?: string;
      videoCount?: number;
    },
  ) {
    return this.prisma.pinnedPlaylist.upsert({
      where: { userId_playlistId: { userId, playlistId: data.playlistId } },
      create: { userId, ...data },
      update: {
        title: data.title,
        thumbnailUrl: data.thumbnailUrl,
        videoCount: data.videoCount,
      },
    });
  }

  async unpin(userId: string, playlistId: string): Promise<{ count: number }> {
    const result = await this.prisma.pinnedPlaylist.deleteMany({
      where: { userId, playlistId },
    });
    return { count: result.count };
  }

  async list(userId: string) {
    return this.prisma.pinnedPlaylist.findMany({
      where: { userId },
      orderBy: { pinnedAt: 'asc' },
    });
  }
}