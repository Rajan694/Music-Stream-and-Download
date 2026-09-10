import { Router } from 'express';
import { ErrorCode } from '@music/shared';
import { Container } from '../container.js';
import { HttpError } from '../lib/http-error.js';
import { requireAdmin } from '../middleware/require-admin.js';

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60_000;
const MAX_LIMIT = 100;

/**
 * Every row in PlayEvent already passed the 30s/50% scrobble threshold in
 * HistoryService.recordPlayEvents, so a row *is* a play. `completed` is extra
 * metadata (played to the end), not the definition of a play — filtering on it
 * here would silently report a much smaller, different metric.
 */
export function createAdminRouter(container: Container) {
  const { prisma, requireAuth } = container;
  const router = Router();

  // requireAdmin reads req.user, which only requireAuth populates. Mounting
  // requireAdmin alone would 401 on every request.
  router.use(requireAuth, requireAdmin);

  function parseRange(from?: string, to?: string): { fromDate: Date; toDate: Date } {
    const fromDate = from ? new Date(from) : new Date(Date.now() - DEFAULT_WINDOW_MS);
    const toDate = to ? new Date(to) : new Date();
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new HttpError(400, ErrorCode.VALIDATION_ERROR, 'from/to must be ISO-8601 dates');
    }
    if (fromDate > toDate) {
      throw new HttpError(400, ErrorCode.VALIDATION_ERROR, 'from must be before to');
    }
    return { fromDate, toDate };
  }

  function parseLimit(raw?: string): number {
    const n = Number.parseInt(raw ?? '10', 10);
    if (!Number.isFinite(n) || n < 1) return 10;
    return Math.min(n, MAX_LIMIT);
  }

  router.get('/overview', async (req, res, next) => {
    try {
      const { from, to } = req.query as { from?: string; to?: string };
      const { fromDate, toDate } = parseRange(from, to);
      const dayAgo = new Date(Date.now() - 24 * 60 * 60_000);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000);

      const [totalUsers, signups, plays, listening, downloads, activity] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: fromDate, lte: toDate } } }),
        prisma.playEvent.count({ where: { playedAt: { gte: fromDate, lte: toDate } } }),
        prisma.playEvent.aggregate({
          where: { playedAt: { gte: fromDate, lte: toDate } },
          _sum: { msPlayed: true },
        }),
        prisma.downloadJob.groupBy({
          by: ['state'],
          where: { createdAt: { gte: fromDate, lte: toDate } },
          _count: { _all: true },
        }),
        // COUNT(DISTINCT) has no Prisma equivalent — groupBy would pull one row
        // per active user just to take .length.
        prisma.$queryRaw<Array<{ dau: bigint; wau: bigint }>>`
          SELECT
            COUNT(DISTINCT "userId") FILTER (WHERE "playedAt" >= ${dayAgo})  AS dau,
            COUNT(DISTINCT "userId") FILTER (WHERE "playedAt" >= ${weekAgo}) AS wau
          FROM "PlayEvent"
        `,
      ]);

      const byState = Object.fromEntries(
        downloads.map((d) => [d.state, d._count._all]),
      ) as Record<string, number>;

      res.json({
        totalUsers,
        signups,
        dau: Number(activity[0]?.dau ?? 0),
        wau: Number(activity[0]?.wau ?? 0),
        plays,
        listeningMinutes: Math.round((listening._sum.msPlayed ?? 0) / 60_000),
        downloads: {
          total: Object.values(byState).reduce((a, b) => a + b, 0),
          completed: byState.completed ?? 0,
          failed: byState.failed ?? 0,
          byState,
        },
        period: { from: fromDate.toISOString(), to: toDate.toISOString() },
      });
    } catch (e) { next(e); }
  });

  router.get('/top-listeners', async (req, res, next) => {
    try {
      const { from, to, limit } = req.query as { from?: string; to?: string; limit?: string };
      const { fromDate, toDate } = parseRange(from, to);

      const rows = await prisma.$queryRaw<
        Array<{ userId: string; email: string; plays: bigint; msPlayed: bigint }>
      >`
        SELECT p."userId", u."email",
               COUNT(*)               AS plays,
               COALESCE(SUM(p."msPlayed"), 0) AS "msPlayed"
        FROM "PlayEvent" p
        JOIN "User" u ON u."id" = p."userId"
        WHERE p."playedAt" >= ${fromDate} AND p."playedAt" <= ${toDate}
        GROUP BY p."userId", u."email"
        ORDER BY plays DESC
        LIMIT ${parseLimit(limit)}
      `;

      res.json(rows.map((r) => ({
        userId: r.userId,
        email: r.email,
        plays: Number(r.plays),
        msPlayed: Number(r.msPlayed),
      })));
    } catch (e) { next(e); }
  });

  router.get('/top-tracks', async (req, res, next) => {
    try {
      const { from, to, limit } = req.query as { from?: string; to?: string; limit?: string };
      const { fromDate, toDate } = parseRange(from, to);

      // Title/uploader are denormalised onto each event and can drift between
      // rows for the same video; take the most recent rather than an arbitrary one.
      const rows = await prisma.$queryRaw<
        Array<{ videoId: string; title: string; uploaderName: string; plays: bigint; uniqueListeners: bigint }>
      >`
        SELECT p."videoId",
               (ARRAY_AGG(p."title"        ORDER BY p."playedAt" DESC))[1] AS title,
               (ARRAY_AGG(p."uploaderName" ORDER BY p."playedAt" DESC))[1] AS "uploaderName",
               COUNT(*)                     AS plays,
               COUNT(DISTINCT p."userId")   AS "uniqueListeners"
        FROM "PlayEvent" p
        WHERE p."playedAt" >= ${fromDate} AND p."playedAt" <= ${toDate}
        GROUP BY p."videoId"
        ORDER BY plays DESC
        LIMIT ${parseLimit(limit)}
      `;

      res.json(rows.map((r) => ({
        videoId: r.videoId,
        title: r.title,
        uploaderName: r.uploaderName,
        plays: Number(r.plays),
        uniqueListeners: Number(r.uniqueListeners),
      })));
    } catch (e) { next(e); }
  });

  router.get('/top-artists', async (req, res, next) => {
    try {
      const { from, to, limit } = req.query as { from?: string; to?: string; limit?: string };
      const { fromDate, toDate } = parseRange(from, to);

      const rows = await prisma.$queryRaw<
        Array<{ uploaderName: string; plays: bigint; uniqueListeners: bigint; tracks: bigint }>
      >`
        SELECT p."uploaderName",
               COUNT(*)                    AS plays,
               COUNT(DISTINCT p."userId")  AS "uniqueListeners",
               COUNT(DISTINCT p."videoId") AS tracks
        FROM "PlayEvent" p
        WHERE p."playedAt" >= ${fromDate} AND p."playedAt" <= ${toDate}
        GROUP BY p."uploaderName"
        ORDER BY plays DESC
        LIMIT ${parseLimit(limit)}
      `;

      res.json(rows.map((r) => ({
        uploaderName: r.uploaderName,
        plays: Number(r.plays),
        uniqueListeners: Number(r.uniqueListeners),
        tracks: Number(r.tracks),
      })));
    } catch (e) { next(e); }
  });

  router.get('/timeseries', async (req, res, next) => {
    try {
      const { metric = 'plays', bucket = 'day', from, to } = req.query as {
        metric?: string; bucket?: string; from?: string; to?: string;
      };
      const { fromDate, toDate } = parseRange(from, to);

      if (bucket !== 'day' && bucket !== 'hour') {
        throw new HttpError(400, ErrorCode.VALIDATION_ERROR, 'bucket must be day or hour');
      }

      // Grouped in Postgres, not in JS: the previous version loaded every
      // matching PlayEvent row into memory to count them.
      let rows: Array<{ bucket: Date; count: bigint }>;
      switch (metric) {
        case 'plays':
          rows = await prisma.$queryRaw`
            SELECT date_trunc(${bucket}, "playedAt") AS bucket, COUNT(*) AS count
            FROM "PlayEvent"
            WHERE "playedAt" >= ${fromDate} AND "playedAt" <= ${toDate}
            GROUP BY bucket ORDER BY bucket
          `;
          break;
        case 'users':
          rows = await prisma.$queryRaw`
            SELECT date_trunc(${bucket}, "createdAt") AS bucket, COUNT(*) AS count
            FROM "User"
            WHERE "createdAt" >= ${fromDate} AND "createdAt" <= ${toDate}
            GROUP BY bucket ORDER BY bucket
          `;
          break;
        case 'downloads':
          rows = await prisma.$queryRaw`
            SELECT date_trunc(${bucket}, "createdAt") AS bucket, COUNT(*) AS count
            FROM "DownloadJob"
            WHERE "createdAt" >= ${fromDate} AND "createdAt" <= ${toDate}
            GROUP BY bucket ORDER BY bucket
          `;
          break;
        default:
          throw new HttpError(400, ErrorCode.VALIDATION_ERROR, 'metric must be plays, users or downloads');
      }

      res.json(rows.map((r) => ({ date: r.bucket.toISOString(), count: Number(r.count) })));
    } catch (e) { next(e); }
  });

  router.get('/downloads/stats', async (req, res, next) => {
    try {
      const { from, to } = req.query as { from?: string; to?: string };
      const { fromDate, toDate } = parseRange(from, to);
      const where = { createdAt: { gte: fromDate, lte: toDate } };

      const [byState, byError, byFormat, byQuality] = await Promise.all([
        prisma.downloadJob.groupBy({ by: ['state'], where, _count: { _all: true } }),
        prisma.downloadJob.groupBy({
          by: ['errorCode'],
          where: { ...where, errorCode: { not: null } },
          _count: { _all: true },
        }),
        prisma.downloadJob.groupBy({ by: ['format'], where, _count: { _all: true } }),
        prisma.downloadJob.groupBy({ by: ['quality'], where, _count: { _all: true } }),
      ]);

      const tally = <T extends string>(rows: Array<{ _count: { _all: number } } & Record<string, unknown>>, key: T) =>
        Object.fromEntries(rows.map((r) => [String(r[key] ?? 'unknown'), r._count._all]));

      res.json({
        byState: tally(byState, 'state'),
        byErrorCode: tally(byError, 'errorCode'),
        byFormat: tally(byFormat, 'format'),
        byQuality: tally(byQuality, 'quality'),
        period: { from: fromDate.toISOString(), to: toDate.toISOString() },
      });
    } catch (e) { next(e); }
  });

  router.get('/users', async (req, res, next) => {
    try {
      const { q, cursor, limit } = req.query as { q?: string; cursor?: string; limit?: string };
      const take = parseLimit(limit);

      const users = await prisma.user.findMany({
        where: q ? { email: { contains: q, mode: 'insensitive' } } : undefined,
        select: { id: true, email: true, role: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      const hasMore = users.length > take;
      const page = hasMore ? users.slice(0, take) : users;
      res.json({ users: page, nextCursor: hasMore ? page[page.length - 1]?.id : null });
    } catch (e) { next(e); }
  });

  return router;
}
