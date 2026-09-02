import { Injectable } from '@nestjs/common';

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/**
 * In-process LRU with TTL. Deliberately behind a narrow interface so Redis can
 * replace it in a later phase without touching callers (§31).
 *
 * Insertion order in a Map is the recency order here: a read re-inserts the
 * key, so the oldest entry is always the first one iterated.
 */
@Injectable()
export class CacheStore {
  private readonly store = new Map<string, CacheEntry>();

  constructor(private readonly maxEntries = 1000) {}

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    // Refresh recency.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    this.evict();
  }

  /** Fetches through the cache, storing only successful results. */
  async wrap<T>(
    key: string,
    ttlMs: number,
    factory: () => Promise<T>,
  ): Promise<T> {
    const hit = this.get<T>(key);
    if (hit !== undefined) return hit;

    const value = await factory();
    this.set(key, value, ttlMs);
    return value;
  }

  /** Drops a key, e.g. when a cached upstream URL turns out to have expired. */
  delete(key: string): void {
    this.store.delete(key);
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
