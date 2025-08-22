/**
 * 缓存性能测试
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryCache, getGlobalCache } from '../src/services/cache/memory.js';
import { TTLManager, TTLUtils } from '../src/services/cache/ttl.js';

describe('MemoryCache', () => {
  let cache: MemoryCache<string>;

  beforeEach(() => {
    cache = new MemoryCache<string>({
      maxSize: 5,
      defaultTTL: 1000,
      cleanupInterval: 100,
      maxMemoryUsage: 1024,
    });
  });

  afterEach(() => {
    cache.destroy();
  });

  it('should set and get values', () => {
    cache.set('test', 'value');
    expect(cache.get('test')).toBe('value');
  });

  it('should return null for non-existent keys', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('should handle TTL expiration', async () => {
    cache.set('test', 'value', 50); // 50ms TTL
    expect(cache.get('test')).toBe('value');
    
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(cache.get('test')).toBeNull();
  });

  it('should update access count on get', () => {
    cache.set('test', 'value');
    cache.get('test');
    cache.get('test');
    
    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(0);
  });

  it('should track hit rate correctly', () => {
    cache.set('test', 'value');
    cache.get('test'); // hit
    cache.get('nonexistent'); // miss
    
    const stats = cache.getStats();
    expect(stats.hitRate).toBe(0.5);
  });

  it('should evict LRU items when max size exceeded', () => {
    // Fill cache to max size
    for (let i = 0; i < 5; i++) {
      cache.set(`key${i}`, `value${i}`);
    }
    
    // Access some items to establish LRU order
    cache.get('key1');
    cache.get('key2');
    
    // Add one more item (should evict key0 as least recently used)
    cache.set('key5', 'value5');
    
    expect(cache.get('key0')).toBeNull(); // Should be evicted
    expect(cache.get('key1')).toBe('value1'); // Should still exist
    expect(cache.get('key5')).toBe('value5'); // New item should exist
  });

  it('should clear all items', () => {
    cache.set('test1', 'value1');
    cache.set('test2', 'value2');
    
    expect(cache.size()).toBe(2);
    
    cache.clear();
    
    expect(cache.size()).toBe(0);
    expect(cache.get('test1')).toBeNull();
  });

  it('should handle has() method correctly', () => {
    cache.set('test', 'value');
    expect(cache.has('test')).toBe(true);
    expect(cache.has('nonexistent')).toBe(false);
  });

  it('should delete items correctly', () => {
    cache.set('test', 'value');
    expect(cache.has('test')).toBe(true);
    
    cache.delete('test');
    expect(cache.has('test')).toBe(false);
  });

  it('should return correct keys list', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    
    const keys = cache.keys();
    expect(keys).toContain('key1');
    expect(keys).toContain('key2');
    expect(keys.length).toBe(2);
  });
});

describe('TTLManager', () => {
  let ttlManager: TTLManager;
  
  beforeEach(() => {
    ttlManager = new TTLManager(50); // 50ms cleanup interval
  });

  afterEach(() => {
    ttlManager.destroy();
  });

  it('should set and check TTL items', () => {
    ttlManager.set('test', 1000); // 1 second TTL
    
    expect(ttlManager.isExpired('test')).toBe(false);
    expect(ttlManager.getRemainingTime('test')).toBeGreaterThan(0);
  });

  it('should handle expiration correctly', async () => {
    ttlManager.set('test', 50); // 50ms TTL
    
    expect(ttlManager.isExpired('test')).toBe(false);
    
    await new Promise(resolve => setTimeout(resolve, 60));
    
    expect(ttlManager.isExpired('test')).toBe(true);
  });

  it('should refresh TTL correctly', () => {
    // 使用模拟时间来控制测试
    vi.useFakeTimers();
    let currentTime = Date.now();
    
    const mockTimeProvider = () => currentTime;
    const ttlManager = new TTLManager(60000, mockTimeProvider);
    
    ttlManager.set('test', 1000);
    
    const initialRemaining = ttlManager.getRemainingTime('test');
    
    // 推进时间100ms
    currentTime += 100;
    vi.advanceTimersByTime(100);
    
    // 刷新TTL为2000ms
    ttlManager.refresh('test', 2000);
    const newRemaining = ttlManager.getRemainingTime('test');
    
    // 新的剩余时间应该大于初始剩余时间（因为设置了更长的TTL）
    expect(newRemaining).toBeGreaterThan(initialRemaining);
    
    vi.useRealTimers();
  });

  it('should extend TTL correctly', () => {
    ttlManager.set('test', 1000);
    
    const success = ttlManager.extend('test', 1000);
    expect(success).toBe(true);
    
    const remaining = ttlManager.getRemainingTime('test');
    expect(remaining).toBeGreaterThan(1500); // Should be around 2000ms
  });

  it('should execute callback on expiration', (done) => {
    const callback = vi.fn(() => {
      expect(callback).toHaveBeenCalled();
      done();
    });
    
    ttlManager.set('test', 50, callback);
  });

  it('should delete TTL items correctly', () => {
    ttlManager.set('test', 1000);
    expect(ttlManager.isExpired('test')).toBe(false);
    
    const deleted = ttlManager.delete('test');
    expect(deleted).toBe(true);
    expect(ttlManager.isExpired('test')).toBe(true);
  });

  it('should get active and expired keys', () => {
    // 这个测试检查在自动过期之前的状态
    vi.useFakeTimers();
    let currentTime = Date.now();
    
    const mockTimeProvider = () => currentTime;
    const ttlManager = new TTLManager(60000, mockTimeProvider);
    
    ttlManager.set('active', 1000);
    ttlManager.set('expired', 50);
    
    // 推进时间60ms，但不触发定时器
    currentTime += 60;
    // 注意：不调用 vi.advanceTimersByTime，这样定时器不会触发
    
    const activeKeys = ttlManager.getActiveKeys();
    const expiredKeys = ttlManager.getExpiredKeys();
    
    expect(activeKeys).toContain('active');
    expect(expiredKeys).toContain('expired');
    
    vi.useRealTimers();
  });

  it('should provide correct stats', () => {
    ttlManager.set('item1', 1000);
    ttlManager.set('item2', 2000);
    
    const stats = ttlManager.getStats();
    expect(stats.totalItems).toBe(2);
    expect(stats.activeItems).toBe(2);
    expect(stats.expiredItems).toBe(0);
  });

  it('should cleanup expired items', () => {
    // 测试手动清理过期项，而不是依赖自动定时器
    vi.useFakeTimers();
    let currentTime = Date.now();
    
    const mockTimeProvider = () => currentTime;
    const ttlManager = new TTLManager(60000, mockTimeProvider);
    
    ttlManager.set('test1', 50);
    ttlManager.set('test2', 1000);
    
    // 推进时间60ms，使test1过期但test2还活跃
    currentTime += 60;
    // 不调用 vi.advanceTimersByTime，避免自动清理
    
    // 手动触发清理
    const cleanedCount = ttlManager.cleanup();
    expect(cleanedCount).toBe(1);
    
    const stats = ttlManager.getStats();
    expect(stats.activeItems).toBe(1);
    
    vi.useRealTimers();
  });
});

describe('TTLUtils', () => {
  it('should convert time units correctly', () => {
    expect(TTLUtils.seconds(1)).toBe(1000);
    expect(TTLUtils.minutes(1)).toBe(60000);
    expect(TTLUtils.hours(1)).toBe(3600000);
    expect(TTLUtils.days(1)).toBe(86400000);
  });

  it('should format remaining time correctly', () => {
    expect(TTLUtils.formatRemainingTime(0)).toBe('expired');
    expect(TTLUtils.formatRemainingTime(1000)).toBe('1s');
    expect(TTLUtils.formatRemainingTime(60000)).toBe('1m 0s');
    expect(TTLUtils.formatRemainingTime(3600000)).toBe('1h 0m');
    expect(TTLUtils.formatRemainingTime(86400000)).toBe('1d 0h');
  });
});

describe('Global Cache', () => {
  it('should return singleton instance', () => {
    const cache1 = getGlobalCache();
    const cache2 = getGlobalCache();
    
    expect(cache1).toBe(cache2);
  });
});