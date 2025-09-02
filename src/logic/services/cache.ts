// src/logic/services/cache.service.ts

export class CacheService {
  private cache: Map<string, any> = new Map();
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    // Move to end to signify recent use (for LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  set<T>(key: string, value: T, ttl: number): void {
    if (this.cache.size >= this.maxSize) {
      // Evict least recently used item
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    const entry = {
      value,
      expiry: Date.now() + ttl,
    };
    this.cache.set(key, entry);
  }
}