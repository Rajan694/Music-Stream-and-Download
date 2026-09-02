import { Controller, Get } from '@nestjs/common';
import { PrismaClient } from '@music/db';

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaClient) {}

  @Get()
  async check() {
    const checks: Record<string, string> = {};

    // Database connectivity
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.postgres = 'ok';
    } catch {
      checks.postgres = 'unavailable';
    }

    const status = Object.values(checks).every((s) => s === 'ok')
      ? 'ok'
      : 'degraded';

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks,
    };
  }
}
