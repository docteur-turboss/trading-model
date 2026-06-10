export interface CacheEntry<T = unknown> {
  data: T;
  status: number;
  expiresAt: number;
}

export class ResponseCache {
  private readonly store = new Map<string, CacheEntry>();

  private readonly defaultTtlMs: number;

  constructor(defaultTtlMs: number) {
    this.defaultTtlMs = defaultTtlMs;
  }

  get<T = unknown>(key: string): CacheEntry<T> | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry as CacheEntry<T>;
  }

  set<T = unknown>(key: string, data: T, status: number, ttlMs?: number): void {
    this.store.set(key, {
      data,
      status,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  invalidate(pattern: string): void {
    const regex = new RegExp(
      pattern
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\\\*/g, '.*'),
    );

    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
      }
    }
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}
