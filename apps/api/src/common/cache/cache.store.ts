import { Injectable } from '@nestjs/common';

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/**
 * Metadata cache contract (§31). Async because Redis is a network hop; the
 * in-process backend just resolves immediately.
 *
 * `wrap` is defined here so both backends share the read-through semantics —
 * only successful results are stored, and a factory rejection never poisons
 * the key.
 */
@Injectable()
export abstract class CacheStore {
  abstract get<T>(key: string): Promise<T | undefined>;

  abstract set<T>(key: string, value: T, ttlMs: number): Promise<void>;

  /** Drops a key, e.g. when a cached upstream URL turns out to have expired. */
  abstract delete(key: string): Promise<void>;

  /**
   * Backend reachability, for `/health`. A false here is degraded, not down:
   * every cache failure falls through to the provider.
   */
  abstract healthy(): Promise<boolean>;

  /** Backend name, so `/health` can say which one is actually in use. */
  abstract readonly backend: string;

  /**
   * Factory calls that have started but not yet resolved, keyed like the cache.
   * Per-process by design: with several API instances each one dedupes its own
   * traffic, which is the part that costs a yt-dlp spawn.
   */
  private readonly inFlight = new Map<string, Promise<unknown>>();

  /**
   * Fetches through the cache, storing only successful results.
   *
   * Concurrent misses on the same key share one factory call. Without this, a
   * page that opens a track and its queue neighbours at once spawns yt-dlp
   * several times over for work that produces one answer — the miss window is
   * seconds wide, so overlapping requests are the normal case rather than a
   * race worth ignoring.
   */
  async wrap<T>(
    key: string,
    ttlMs: number,
    factory: () => Promise<T>,
  ): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== undefined) return hit;

    const pending = this.inFlight.get(key) as Promise<T> | undefined;
    if (pending) return pending;

    const call = (async () => {
      const value = await factory();
      await this.set(key, value, ttlMs);
      return value;
    })().finally(() => {
      // Cleared on rejection too, so a failed lookup is retried rather than
      // every later caller inheriting the same error.
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, call);
    return call;
  }
}

/**
 * In-process LRU with TTL. The default backend, and the fallback whenever
 * `REDIS_URL` is unset.
 *
 * Insertion order in a Map is the recency order here: a read re-inserts the
 * key, so the oldest entry is always the first one iterated.
 */
@Injectable()
export class MemoryCacheStore extends CacheStore {
  readonly backend = 'memory';

  private readonly store = new Map<string, CacheEntry>();

  constructor(private readonly maxEntries = 1000) {
    super();
  }

  healthy(): Promise<boolean> {
    return Promise.resolve(true);
  }

  get<T>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (!entry) return Promise.resolve(undefined);

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return Promise.resolve(undefined);
    }

    // Refresh recency.
    this.store.delete(key);
    this.store.set(key, entry);
    return Promise.resolve(entry.value as T);
  }

  set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    this.evict();
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }

  get size(): number {
    return this.store.size;
  }

  private evict(): void {
    if (this.store.size <= this.maxEntries) return;

    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }

    // Still over budget: drop least-recently-used keys.
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next();
      if (oldest.done) break;
      this.store.delete(oldest.value);
    }
  }
}
