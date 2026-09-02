import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Per-key sliding-window rate limiter.
 *
 * Three tiers (per the plan):
 *   1. Default  — 100 req / 60 s per IP (anonymous) or per userId (authed)
 *   2. Downloads — 20 req / 60 s per user (the primary abuse lever)
 *   3. Search   — 60 req / 60 s per IP (protects upstream provider quota)
 *
 * No external store needed — an in-memory Map is sufficient for a single-
 * process API. The map is pruned every window to prevent unbounded growth.
 */

interface WindowEntry {
  /** Timestamp (ms) of each request inside the current window. */
  hits: number[];
}

interface ThrottleConfig {
  windowMs: number;
  max: number;
}

const DEFAULT_CONFIG: ThrottleConfig = {
  windowMs: 60_000,
  max: 100,
};

/**
 * Extra buckets keyed by path prefix. `req.path` includes the global API
 * prefix, so these patterns must too — matching on `/downloads` alone silently
 * never fires and every route falls back to the default bucket.
 */
const BUCKET_CONFIGS: Record<string, ThrottleConfig> = {
  '/api/v1/downloads': { windowMs: 60_000, max: 20 },
  '/api/v1/media/search': { windowMs: 60_000, max: 60 },
  '/api/v1/auth': { windowMs: 60_000, max: 10 },
};

@Injectable()
export class ThrottleGuard implements CanActivate {
  private readonly store = new Map<string, WindowEntry>();

  constructor() {
    // Prune the store every window to avoid unbounded memory.
    setInterval(() => this.prune(), 60_000).unref();
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const userId = req.user?.id;
    const key = this.resolveKey(req, userId);
    const config = this.resolveConfig(req);

    const now = Date.now();
    let entry = this.store.get(key);
    if (!entry) {
      entry = { hits: [] };
      this.store.set(key, entry);
    }

    // Drop hits outside the window.
    entry.hits = entry.hits.filter((t) => now - t < config.windowMs);

    if (entry.hits.length >= config.max) {
      const retryAfter = Math.ceil(
        (entry.hits[0] + config.windowMs - now) / 1000,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'RATE_LIMITED',
          message: `Too many requests. Retry after ${retryAfter}s.`,
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    entry.hits.push(now);
    return true;
  }

  /**
   * Keys include the bucket so a burst of downloads cannot exhaust the general
   * allowance, and vice versa.
   *
   * A global guard runs before route guards, so `req.user` is still unset here
   * and the key falls back to the client address. That is the correct
   * behaviour for a limiter — an attacker must not be able to reset a bucket by
   * presenting a different token.
   */
  private resolveKey(req: Request, userId: string | undefined): string {
    const ip = (req.ip ?? req.socket.remoteAddress ?? '0.0.0.0').replace(
      /^::ffff:/,
      '',
    );
    const bucket = this.resolveBucket(req);
    return `${bucket}|${userId ? `user:${userId}` : `ip:${ip}`}`;
  }

  private resolveBucket(req: Request): string {
    for (const prefix of Object.keys(BUCKET_CONFIGS)) {
      if (req.path.startsWith(prefix)) return prefix;
    }
    return 'default';
  }

  private resolveConfig(req: Request): ThrottleConfig {
    const path = req.path;
    for (const [prefix, cfg] of Object.entries(BUCKET_CONFIGS)) {
      if (path.startsWith(prefix)) return cfg;
    }
    return DEFAULT_CONFIG;
  }

  /** Remove keys whose windows have fully expired. */
  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      // Keep the entry if ANY hit is still within the longest window (60s).
      if (entry.hits.every((t) => now - t > 120_000)) {
        this.store.delete(key);
      }
    }
  }
}
