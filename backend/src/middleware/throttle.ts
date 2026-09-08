import type { Request, Response, NextFunction } from 'express';
import { HttpError } from '../lib/http-error.js';
import { ErrorCode } from '@music/shared';

interface WindowEntry {
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

const BUCKET_CONFIGS: Record<string, ThrottleConfig> = {
  '/api/v1/downloads': { windowMs: 60_000, max: 20 },
  '/api/v1/media/search': { windowMs: 60_000, max: 60 },
  '/api/v1/auth': { windowMs: 60_000, max: 10 },
};

const store = new Map<string, WindowEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.hits.every((t) => now - t > 120_000)) {
      store.delete(key);
    }
  }
}, 60_000).unref();

export function throttle(req: Request, _res: Response, next: NextFunction): void {
  const userId = req.user?.id;
  const ip = (req.ip ?? req.socket.remoteAddress ?? '0.0.0.0').replace(/^::ffff:/, '');
  const bucket = resolveBucket(req);
  const key = `${bucket}|${userId ? `user:${userId}` : `ip:${ip}`}`;
  const config = resolveConfig(req);

  const now = Date.now();
  let entry = store.get(key);
  if (!entry) {
    entry = { hits: [] };
    store.set(key, entry);
  }

  entry.hits = entry.hits.filter((t) => now - t < config.windowMs);

  if (entry.hits.length >= config.max) {
    const retryAfter = Math.ceil((entry.hits[0] + config.windowMs - now) / 1000);
    throw new HttpError(429, ErrorCode.RATE_LIMITED, `Too many requests. Retry after ${retryAfter}s.`);
  }

  entry.hits.push(now);
  next();
}

function resolveBucket(req: Request): string {
  for (const prefix of Object.keys(BUCKET_CONFIGS)) {
    if (req.path.startsWith(prefix)) return prefix;
  }
  return 'default';
}

function resolveConfig(req: Request): ThrottleConfig {
  const path = req.path;
  for (const [prefix, cfg] of Object.entries(BUCKET_CONFIGS)) {
    if (path.startsWith(prefix)) return cfg;
  }
  return DEFAULT_CONFIG;
}