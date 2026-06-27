interface CacheEntry {
  data: unknown;
  expiry: number;
}

interface CacheStats {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  entries: number;
}

class ApiCache {
  private store = new Map<string, CacheEntry>();
  private totalRequests = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private ttl: number;

  constructor(ttlMs = 86_400_000) {
    this.ttl = ttlMs;
  }

  get(key: string): { data: unknown; hit: boolean } | null {
    this.totalRequests++;
    const entry = this.store.get(key);
    if (entry && entry.expiry > Date.now()) {
      this.cacheHits++;
      return { data: entry.data, hit: true };
    }
    if (entry) this.store.delete(key);
    this.cacheMisses++;
    return null;
  }

  set(key: string, data: unknown): void {
    this.store.set(key, { data, expiry: Date.now() + this.ttl });
  }

  stats(): CacheStats {
    return {
      totalRequests: this.totalRequests,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      entries: this.store.size,
    };
  }
}

export const apiCache = new ApiCache();
