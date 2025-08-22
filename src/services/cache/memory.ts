/**
 * 内存缓存实现
 * 轻量级LRU缓存，支持TTL和自动清理
 */
import type { CacheItem, CacheStats, CacheConfig } from '@/types';
import { CACHE_CONFIG } from '@/utils/constants.js';
import { log } from '@/utils/logger.js';
import { getGlobalCacheManager } from './manager.js';

/**
 * 内存缓存类
 */
export class MemoryCache<T = any> {
  private cache = new Map<string, CacheItem<T>>();
  private accessOrder = new Map<string, number>(); // LRU访问顺序
  private config: CacheConfig;
  private stats: CacheStats;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private accessCounter = 0;
  private cacheManager = getGlobalCacheManager();

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: CACHE_CONFIG.MAX_CACHE_SIZE,
      defaultTTL: CACHE_CONFIG.MODEL_LIST_TTL,
      cleanupInterval: CACHE_CONFIG.CLEANUP_INTERVAL,
      maxMemoryUsage: CACHE_CONFIG.MAX_MEMORY_USAGE,
      ...config,
    };

    this.stats = {
      hits: 0,
      misses: 0,
      size: 0,
      memoryUsage: 0,
      hitRate: 0,
    };

    this.startCleanupTimer();
  }

  /**
   * 设置缓存项
   */
  set(key: string, value: T, ttl?: number): void {
    const now = Date.now();
    const expirationTime = ttl || this.config.defaultTTL;
    const size = this.calculateSize(value);

    // 检查内存限制
    if (this.stats.memoryUsage + size > this.config.maxMemoryUsage) {
      this.evictLRU(size);
    }

    // 检查容量限制
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    // 如果key已存在，先删除旧值
    if (this.cache.has(key)) {
      this.deleteInternal(key);
    }

    const item: CacheItem<T> = {
      key,
      value,
      expiresAt: now + expirationTime,
      createdAt: now,
      accessCount: 1,
      lastAccessed: now,
      size,
    };

    this.cache.set(key, item);
    this.accessOrder.set(key, ++this.accessCounter);
    
    // 通知缓存管理器内存使用变化
    this.cacheManager.recordMemoryUsage(size);
    
    this.updateStats();
  }

  /**
   * 获取缓存项
   */
  get(key: string): T | null {
    const item = this.cache.get(key);
    
    if (!item) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // 检查是否过期
    if (item.expiresAt < Date.now()) {
      this.delete(key);
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // 更新访问信息
    item.accessCount++;
    item.lastAccessed = Date.now();
    this.accessOrder.set(key, ++this.accessCounter);

    this.stats.hits++;
    this.updateHitRate();
    
    return item.value;
  }

  /**
   * 检查key是否存在且未过期
   */
  has(key: string): boolean {
    const item = this.cache.get(key);
    
    if (!item) {
      return false;
    }

    if (item.expiresAt < Date.now()) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * 删除缓存项
   */
  delete(key: string): boolean {
    return this.deleteInternal(key);
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder.clear();
    this.accessCounter = 0;
    this.stats.size = 0;
    this.stats.memoryUsage = 0;
    this.updateHitRate();
  }

  /**
   * 获取所有有效的key
   */
  keys(): string[] {
    this.cleanupExpired();
    return Array.from(this.cache.keys());
  }

  /**
   * 获取缓存大小
   */
  size(): number {
    this.cleanupExpired();
    return this.cache.size;
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * 获取缓存配置
   */
  getConfig(): CacheConfig {
    return { ...this.config };
  }

  /**
   * 手动清理过期项
   */
  cleanup(): number {
    return this.cleanupExpired();
  }

  /**
   * 销毁缓存，停止清理定时器
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }

  // === 私有方法 ===

  private deleteInternal(key: string): boolean {
    const item = this.cache.get(key);
    if (!item) {
      return false;
    }

    this.cache.delete(key);
    this.accessOrder.delete(key);
    this.stats.memoryUsage -= item.size;
    
    // 通知缓存管理器内存释放
    this.cacheManager.recordMemoryUsage(-item.size);
    
    this.updateStats();
    
    return true;
  }

  private evictLRU(requiredSpace: number = 0): void {
    // 找到最少使用的项并删除
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, accessTime] of this.accessOrder.entries()) {
      if (accessTime < oldestAccess) {
        oldestAccess = accessTime;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.deleteInternal(oldestKey);
      
      // 如果需要更多空间，继续删除
      if (requiredSpace > 0 && this.stats.memoryUsage + requiredSpace > this.config.maxMemoryUsage) {
        this.evictLRU(requiredSpace);
      }
    }
  }

  private cleanupExpired(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, item] of this.cache.entries()) {
      if (item.expiresAt < now) {
        this.deleteInternal(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      log.debug(`Cleaned up ${cleanedCount} expired cache items`);
    }

    return cleanedCount;
  }

  /**
   * 智能清理方法，被缓存管理器调用
   */
  performIntelligentCleanup(): { itemsRemoved: number; memoryFreed: number } {
    const startMemory = this.stats.memoryUsage;
    let itemsRemoved = 0;

    // 1. 清理过期项
    itemsRemoved += this.cleanupExpired();

    // 2. 检查内存压力，如果需要则进行LRU淘汰
    const memoryStats = this.cacheManager.getMemoryStats();
    if (memoryStats.isUnderPressure) {
      const beforeSize = this.cache.size;
      const targetSize = Math.floor(this.cache.size * 0.8); // 减少到80%
      
      while (this.cache.size > targetSize && this.cache.size > 0) {
        this.evictLRU();
        itemsRemoved++;
      }
      
      log.info(`Aggressive cleanup: reduced cache from ${beforeSize} to ${this.cache.size} items`);
    }

    const memoryFreed = startMemory - this.stats.memoryUsage;
    return { itemsRemoved, memoryFreed };
  }

  private calculateSize(value: T): number {
    // 使用缓存管理器的内存估算方法
    return this.cacheManager.estimateMemoryUsage(value);
  }

  private updateStats(): void {
    this.stats.size = this.cache.size;
    // memoryUsage 在其他地方更新
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, this.config.cleanupInterval);
  }
}

/**
 * 全局缓存实例（单例模式）
 */
let globalCache: MemoryCache | null = null;

export function getGlobalCache<T = any>(): MemoryCache<T> {
  if (!globalCache) {
    globalCache = new MemoryCache();
  }
  return globalCache as MemoryCache<T>;
}

/**
 * 缓存装饰器工厂
 */
export function cached<T extends (...args: any[]) => Promise<any>>(
  ttl: number = CACHE_CONFIG.MODEL_LIST_TTL,
  keyGenerator?: (...args: Parameters<T>) => string
): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    const cache = getGlobalCache();

    descriptor.value = async function (...args: Parameters<T>): Promise<ReturnType<T>> {
      const cacheKey = keyGenerator 
        ? keyGenerator(...args)
        : `${target.constructor.name}.${propertyKey}:${JSON.stringify(args)}`;

      // 尝试从缓存获取
      const cachedResult = cache.get(cacheKey);
      if (cachedResult !== null) {
        return cachedResult;
      }

      // 执行原方法并缓存结果
      const result = await originalMethod.apply(this, args);
      cache.set(cacheKey, result, ttl);
      
      return result;
    };
  };
}