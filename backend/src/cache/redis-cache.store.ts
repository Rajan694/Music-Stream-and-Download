import { Redis } from 'ioredis';
import { CacheStore } from './cache.store.js';

const KEY_PREFIX = 'music:cache:';

/**
 * Redis-backed metadata cache. Survives restarts.
 * Every Redis failure degrades to a miss rather than an error.
 */
export class RedisCacheStore extends CacheStore {
  readonly backend = 'redis';
  private readonly redis: Redis;
  private degraded = false;

  constructor(url: string) {
    super();
    this.redis = new Redis(url, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: false,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });

    this.redis.on('error', (error: Error) => this.markDegraded(error));
    this.redis.on('ready', () => {
      if (this.degraded) console.log('[RedisCache] Redis cache recovered');
      this.degraded = false;
      console.log('[RedisCache] Redis cache connected');
    });
  }

  private markDegraded(error: unknown): void {
    if (this.degraded) return;
    this.degraded = true;
    console.warn(
      `[RedisCache] Redis cache unavailable, falling through to upstream: ${(error as Error).message}`,
    );
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await this.redis.get(KEY_PREFIX + key);
      if (raw === null) return undefined;
      return JSON.parse(raw) as T;
    } catch (error) {
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

  async close(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}