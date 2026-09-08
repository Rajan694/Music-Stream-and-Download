interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/**
 * Metadata cache contract. Async because Redis is a network hop.
 * `wrap` is defined here so both backends share the read-through semantics.
 */
export abstract class CacheStore {
  abstract get<T>(key: string): Promise<T | undefined>;
  abstract set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  abstract delete(key: string): Promise<void>;
  abstract healthy(): Promise<boolean>;
  abstract readonly backend: string;

  /** Releases any backend connection on shutdown. No-op for in-process stores. */
  async close(): Promise<void> {}

  private readonly inFlight = new Map<string, Promise<unknown>>();

  async wrap<T>(key: string, ttlMs: number, factory: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== undefined) return hit;

    const pending = this.inFlight.get(key) as Promise<T> | undefined;
    if (pending) return pending;

    const call = (async () => {
      const value = await factory();
      await this.set(key, value, ttlMs);
      return value;
    })().finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, call);
    return call;
  }
}

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

  private evict(): void {
    if (this.store.size <= this.maxEntries) return;
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next();
      if (oldest.done) break;
      this.store.delete(oldest.value);
    }
  }
}