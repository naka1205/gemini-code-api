// src/logic/services/cache.ts
interface CacheEntry {
  value: any;
  expires: number;
  accessCount: number;
  lastAccess: number;
  size: number;
  priority: 'high' | 'medium' | 'low';
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  totalSize: number;
  l1Hits: number;
  l2Hits: number;
}

interface CacheConfig {
  maxSize: number;
  defaultTTL: number;
  memoryLimitMB: number;
  l1Size: number;
  l2Size: number;
}

export class EnhancedCacheService {
  private l1Cache: Map<string, CacheEntry> = new Map(); // Hot data - fastest access
  private l2Cache: Map<string, CacheEntry> = new Map(); // Warm data - LRU managed
  private l1Order: string[] = [];
  private l2Order: string[] = [];
  private stats: CacheStats = { hits: 0, misses: 0, evictions: 0, totalSize: 0, l1Hits: 0, l2Hits: 0 };
  private cleanupTimer?: ReturnType<typeof setInterval>;
  
  constructor(private config: CacheConfig = {
    maxSize: 1000,
    defaultTTL: 300000, // 5 minutes
    memoryLimitMB: 50,
    l1Size: 100,
    l2Size: 900
  }) {
    this.startCleanupTimer();
  }

  async get<T>(key: string): Promise<T | null> {
    // L1 cache check (hot data)
    const l1Entry = this.l1Cache.get(key);
    if (l1Entry && l1Entry.expires > Date.now()) {
      l1Entry.accessCount++;
      l1Entry.lastAccess = Date.now();
      this.moveToFrontL1(key);
      this.stats.hits++;
      this.stats.l1Hits++;
      return l1Entry.value as T;
    }
    
    // L2 cache check (warm data)
    const l2Entry = this.l2Cache.get(key);
    if (l2Entry && l2Entry.expires > Date.now()) {
      l2Entry.accessCount++;
      l2Entry.lastAccess = Date.now();
      
      // Promote frequently accessed items to L1
      if (this.shouldPromoteToL1(l2Entry)) {
        await this.promoteToL1(key, l2Entry);
      } else {
        this.moveToFrontL2(key);
      }
      
      this.stats.hits++;
      this.stats.l2Hits++;
      return l2Entry.value as T;
    }
    
    // Clean up expired entries if found
    if (l1Entry) {
      this.l1Cache.delete(key);
      this.removeFromL1Order(key);
    }
    if (l2Entry) {
      this.l2Cache.delete(key);
      this.removeFromL2Order(key);
    }
    
    this.stats.misses++;
    return null;
  }

  async set<T>(key: string, value: T, ttl?: number, priority: 'high' | 'medium' | 'low' = 'medium'): Promise<void> {
    const expires = Date.now() + (ttl || this.config.defaultTTL);
    const size = this.estimateObjectSize(value);
    
    // Check memory usage before adding
    await this.ensureMemoryLimit(size);
    
    const entry: CacheEntry = {
      value,
      expires,
      accessCount: 1,
      lastAccess: Date.now(),
      size,
      priority
    };
    
    // High priority items go directly to L1
    if (priority === 'high' || this.shouldAddToL1()) {
      await this.addToL1(key, entry);
    } else {
      await this.addToL2(key, entry);
    }
    
    this.stats.totalSize += size;
  }

  private async addToL1(key: string, entry: CacheEntry): Promise<void> {
    // Remove from L2 if exists
    if (this.l2Cache.has(key)) {
      this.l2Cache.delete(key);
      this.removeFromL2Order(key);
    }
    
    // Remove from L1 if already exists
    if (this.l1Cache.has(key)) {
      this.removeFromL1Order(key);
    }
    
    this.l1Cache.set(key, entry);
    this.l1Order.unshift(key);
    
    // Enforce L1 size limit
    await this.enforceL1Size();
  }

  private async addToL2(key: string, entry: CacheEntry): Promise<void> {
    // Remove from L1 if exists
    if (this.l1Cache.has(key)) {
      this.l1Cache.delete(key);
      this.removeFromL1Order(key);
    }
    
    // Remove from L2 if already exists
    if (this.l2Cache.has(key)) {
      this.removeFromL2Order(key);
    }
    
    this.l2Cache.set(key, entry);
    this.l2Order.unshift(key);
    
    // Enforce L2 size limit
    await this.enforceL2Size();
  }

  private shouldPromoteToL1(entry: CacheEntry): boolean {
    // Promote if accessed frequently or high priority
    return entry.accessCount >= 3 || 
           entry.priority === 'high' ||
           (entry.priority === 'medium' && entry.accessCount >= 2);
  }

  private shouldAddToL1(): boolean {
    // Add to L1 if it's not full or has low utilization
    return this.l1Cache.size < this.config.l1Size * 0.8;
  }

  private async promoteToL1(key: string, entry: CacheEntry): Promise<void> {
    this.l2Cache.delete(key);
    this.removeFromL2Order(key);
    await this.addToL1(key, entry);
  }

  private async enforceL1Size(): Promise<void> {
    while (this.l1Cache.size > this.config.l1Size && this.l1Order.length > 0) {
      const oldestKey = this.l1Order.pop()!;
      const entry = this.l1Cache.get(oldestKey);
      
      if (entry) {
        // Demote to L2 instead of evicting completely
        this.l1Cache.delete(oldestKey);
        await this.addToL2(oldestKey, entry);
      }
    }
  }

  private async enforceL2Size(): Promise<void> {
    while (this.l2Cache.size > this.config.l2Size && this.l2Order.length > 0) {
      const oldestKey = this.l2Order.pop()!;
      const entry = this.l2Cache.get(oldestKey);
      
      if (entry) {
        this.stats.totalSize = Math.max(0, this.stats.totalSize - entry.size);
        this.stats.evictions++;
      }
      
      this.l2Cache.delete(oldestKey);
    }
  }

  async delete(key: string): Promise<boolean> {
    let deleted = false;
    
    // Check L1 cache
    const l1Entry = this.l1Cache.get(key);
    if (l1Entry) {
      this.l1Cache.delete(key);
      this.removeFromL1Order(key);
      this.stats.totalSize = Math.max(0, this.stats.totalSize - l1Entry.size);
      deleted = true;
    }
    
    // Check L2 cache
    const l2Entry = this.l2Cache.get(key);
    if (l2Entry) {
      this.l2Cache.delete(key);
      this.removeFromL2Order(key);
      this.stats.totalSize = Math.max(0, this.stats.totalSize - l2Entry.size);
      deleted = true;
    }
    
    return deleted;
  }

  async clear(): Promise<void> {
    this.l1Cache.clear();
    this.l2Cache.clear();
    this.l1Order = [];
    this.l2Order = [];
    this.stats = { hits: 0, misses: 0, evictions: 0, totalSize: 0, l1Hits: 0, l2Hits: 0 };
  }

  getStats(): CacheStats & { hitRate: number; l1HitRate: number; l2HitRate: number; size: number; l1Size: number; l2Size: number } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;
    const l1HitRate = this.stats.hits > 0 ? this.stats.l1Hits / this.stats.hits : 0;
    const l2HitRate = this.stats.hits > 0 ? this.stats.l2Hits / this.stats.hits : 0;
    
    return {
      ...this.stats,
      hitRate,
      l1HitRate,
      l2HitRate,
      size: this.l1Cache.size + this.l2Cache.size,
      l1Size: this.l1Cache.size,
      l2Size: this.l2Cache.size
    };
  }

  // Create cache key from request parameters
  createKey(prefix: string, ...parts: (string | number | boolean)[]): string {
    const sanitized = parts.map(part => 
      typeof part === 'string' ? part.replace(/[^a-zA-Z0-9_-]/g, '_') : String(part)
    ).join(':');
    return `${prefix}:${sanitized}`;
  }

  // Multi-level cache with different TTLs and priorities
  async setWithTiers(key: string, value: any, options: { 
    ttl?: number; 
    priority: 'high' | 'medium' | 'low';
    adaptiveTTL?: boolean;
  }): Promise<void> {
    let ttl = options.ttl || this.config.defaultTTL;
    
    // Adaptive TTL based on cache pressure and priority
    if (options.adaptiveTTL) {
      const hitRate = this.getStats().hitRate;
      const memoryPressure = this.stats.totalSize / (this.config.memoryLimitMB * 1024 * 1024);
      
      if (hitRate < 0.7 || memoryPressure > 0.8) { // Cache under pressure
        if (options.priority === 'low') {
          ttl = Math.min(ttl, 60000); // 1 minute max for low priority
        } else if (options.priority === 'medium') {
          ttl = Math.min(ttl, 180000); // 3 minutes max for medium priority
        }
        // High priority keeps original TTL even under pressure
      }
    }
    
    await this.set(key, value, ttl, options.priority);
  }

  // Helper methods for LRU order management
  private moveToFrontL1(key: string): void {
    const index = this.l1Order.indexOf(key);
    if (index > 0) {
      this.l1Order.splice(index, 1);
      this.l1Order.unshift(key);
    }
  }

  private moveToFrontL2(key: string): void {
    const index = this.l2Order.indexOf(key);
    if (index > 0) {
      this.l2Order.splice(index, 1);
      this.l2Order.unshift(key);
    }
  }

  private removeFromL1Order(key: string): void {
    const index = this.l1Order.indexOf(key);
    if (index >= 0) {
      this.l1Order.splice(index, 1);
    }
  }

  private removeFromL2Order(key: string): void {
    const index = this.l2Order.indexOf(key);
    if (index >= 0) {
      this.l2Order.splice(index, 1);
    }
  }

  private async ensureMemoryLimit(newItemSize: number): Promise<void> {
    const memoryLimitBytes = this.config.memoryLimitMB * 1024 * 1024;
    
    while (this.stats.totalSize + newItemSize > memoryLimitBytes) {
      let evicted = false;
      
      // First try to evict from L2 (lower priority)
      if (this.l2Order.length > 0) {
        const oldestKey = this.l2Order.pop()!;
        const entry = this.l2Cache.get(oldestKey);
        
        if (entry) {
          this.stats.totalSize = Math.max(0, this.stats.totalSize - entry.size);
          this.stats.evictions++;
          evicted = true;
        }
        
        this.l2Cache.delete(oldestKey);
      }
      
      // If L2 is empty, evict from L1
      if (!evicted && this.l1Order.length > 0) {
        const oldestKey = this.l1Order.pop()!;
        const entry = this.l1Cache.get(oldestKey);
        
        if (entry) {
          this.stats.totalSize = Math.max(0, this.stats.totalSize - entry.size);
          this.stats.evictions++;
        }
        
        this.l1Cache.delete(oldestKey);
      }
      
      // Break if no more entries to evict
      if (this.l1Cache.size === 0 && this.l2Cache.size === 0) {
        break;
      }
    }
  }

  private estimateObjectSize(obj: any): number {
    if (obj === null || obj === undefined) return 0;
    
    const type = typeof obj;
    switch (type) {
      case 'boolean':
        return 4;
      case 'number':
        return 8;
      case 'string':
        return obj.length * 2; // UTF-16 encoding
      case 'object':
        if (obj instanceof Date) return 24;
        if (Array.isArray(obj)) {
          return obj.reduce((size, item) => size + this.estimateObjectSize(item), 24);
        }
        // For objects, estimate based on JSON string length with better accuracy
        try {
          const jsonStr = JSON.stringify(obj);
          // Account for object overhead, property names, and structure
          const baseSize = jsonStr.length * 2; // UTF-16
          const propertyOverhead = Object.keys(obj).length * 24; // Property overhead
          return baseSize + propertyOverhead + 100; // Add base object overhead
        } catch {
          return 1000; // Default estimate for complex objects
        }
      default:
        return 100; // Default estimate
    }
  }

  // Enhanced cleanup with priority-based expiration
  startCleanupTimer(intervalMs: number = 30000): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
      this.optimizeCacheDistribution();
    }, intervalMs);
  }

  private cleanupExpired(): void {
    const now = Date.now();
    
    // Clean L1 cache
    const expiredL1Keys: string[] = [];
    for (const [key, entry] of this.l1Cache.entries()) {
      if (entry.expires <= now) {
        expiredL1Keys.push(key);
      }
    }
    
    for (const key of expiredL1Keys) {
      const entry = this.l1Cache.get(key);
      if (entry) {
        this.stats.totalSize = Math.max(0, this.stats.totalSize - entry.size);
      }
      this.l1Cache.delete(key);
      this.removeFromL1Order(key);
    }
    
    // Clean L2 cache
    const expiredL2Keys: string[] = [];
    for (const [key, entry] of this.l2Cache.entries()) {
      if (entry.expires <= now) {
        expiredL2Keys.push(key);
      }
    }
    
    for (const key of expiredL2Keys) {
      const entry = this.l2Cache.get(key);
      if (entry) {
        this.stats.totalSize = Math.max(0, this.stats.totalSize - entry.size);
      }
      this.l2Cache.delete(key);
      this.removeFromL2Order(key);
    }
  }

  // Optimize cache distribution based on access patterns
  private optimizeCacheDistribution(): void {
    // If L1 is underutilized and L2 has hot items, promote some
    if (this.l1Cache.size < this.config.l1Size * 0.7) {
      const hotL2Items = Array.from(this.l2Cache.entries())
        .filter(([_, entry]) => entry.accessCount >= 2)
        .sort((a, b) => b[1].accessCount - a[1].accessCount)
        .slice(0, Math.min(5, this.config.l1Size - this.l1Cache.size));
      
      for (const [key, entry] of hotL2Items) {
        this.promoteToL1(key, entry);
      }
    }
  }

  // Graceful shutdown
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.clear();
  }
}

// For backward compatibility, export the original CacheService
export const CacheService = EnhancedCacheService;