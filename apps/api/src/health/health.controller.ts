import { Controller, Get } from '@nestjs/common';
import { PrismaClient } from '@music/db';
import { CacheStore } from '../common/cache/cache.store.js';

@Controller('health')
export class HealthController {
  constructor(
    private prisma: PrismaClient,
    private cache: CacheStore,
  ) {}

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

    // Metadata cache. Reported separately from its backend name so a silent
    // fallback to the in-process store is visible rather than looking healthy.
    checks.cache = (await this.cache.healthy()) ? 'ok' : 'unavailable';

    const status = Object.values(checks).every((s) => s === 'ok')
      ? 'ok'
      : 'degraded';

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      cacheBackend: this.cache.backend,
      checks,
    };
  }
}
