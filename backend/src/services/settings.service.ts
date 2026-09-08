import { PrismaClient } from '@music/db';

export class SettingsService {
  constructor(private prisma: PrismaClient) {}

  async getSettings(userId: string) {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });
    if (!settings) {
      return this.prisma.userSettings.create({
        data: { userId },
      });
    }
    return settings;
  }

  async updateSettings(
    userId: string,
    data: {
      defaultFormat?: string;
      defaultQuality?: string;
      streamQuality?: string;
      theme?: string;
    },
  ) {
    const existing = await this.prisma.userSettings.findUnique({
      where: { userId },
    });
    if (!existing) {
      return this.prisma.userSettings.create({
        data: { userId, ...data },
      });
    }
    return this.prisma.userSettings.update({
      where: { userId },
      data,
    });
  }
}