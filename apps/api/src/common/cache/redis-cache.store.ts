import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { CacheStore } from './cache.store.js';

/**
 * Namespaces every key, so a Redis shared with the job queue or a second
 * environment cannot collide with metadata entries.
 */
const KEY_PREFIX = 'music:cache:';

/**
 * Redis-backed metadata cache. Survives restarts, which is the whole point:
 * resolving a video means spawning yt-dlp for several seconds, and the
 * in-process map threw that work away on every reload.
 *
 * Every Redis failure degrades to a miss rather than an error. A cache is an
 * optimisation — an unreachable Redis must slow playback down, never break it.
 */
@Injectable()
export class RedisCacheStore extends CacheStore implements OnModuleDestroy {
  readonly backend = 'redis';

  private readonly logger = new Logger(RedisCacheStore.name);
  private readonly redis: Redis;

  /** Logged once per outage instead of on every request. */
  private degraded = false;

  constructor(url: string) {
    super();

    this.redis = new Redis(url, {
      // A cache read must never outlive the request it is serving. Without
      // these, a dead Redis queues commands and every miss hangs until the
      // socket times out.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: false,
      // Backs off to a 5s ceiling so a long outage does not spin the loop.
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });

    this.redis.on('error', (error: Error) => this.markDegraded(error));
    this.redis.on('ready', () => {
      if (this.degraded) this.logger.log('Redis cache recovered');
      this.degraded = false;
      this.logger.log('Redis cache connected');
    });
  }

  private markDegraded(error: unknown): void {
    if (this.degraded) return;
    this.degraded = true;
    this.logger.warn(
      `Redis cache unavailable, falling through to upstream: ${(error as Error).message}`,
    );
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await this.redis.get(KEY_PREFIX + key);
      if (raw === null) return undefined;
      return JSON.parse(raw) as T;
    } catch (error) {
      // Includes malformed JSON from an older payload shape: treat a value we
      // can no longer read as absent so the next write replaces it.
      this.markDegraded(error);
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    try {
      await this.redis.set(
        KEY_PREFIX + key,
        JSON.stringify(value),
        'PX',
        Math.max(1, Math.trunc(ttlMs)),
      );
    } catch (error) {
      this.markDegraded(error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(KEY_PREFIX + key);
    } catch (error) {
      this.markDegraded(error);
    }
  }

  async healthy(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    // `quit` waits for in-flight commands; `disconnect` would drop a pending
    // write mid-flight on shutdown.
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}
