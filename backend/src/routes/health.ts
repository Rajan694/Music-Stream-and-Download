import { Router } from 'express';
import { Container } from '../container.js';

export function createHealthRouter(container: Container) {
  const { prisma, cache } = container;
  const router = Router();

  router.get('/', async (_req, res) => {
    const checks: Record<string, string> = {};

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.postgres = 'ok';
    } catch {
      checks.postgres = 'unavailable';
    }

    checks.cache = (await cache.healthy()) ? 'ok' : 'unavailable';

    const status = Object.values(checks).every((s) => s === 'ok')
      ? 'ok'
      : 'degraded';

    res.json({
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      cacheBackend: cache.backend,
      checks,
    });
  });

  return router;
}