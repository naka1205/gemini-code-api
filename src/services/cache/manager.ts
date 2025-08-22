/**
 * 增强的缓存管理器
 * 提供智能内存管理、自适应清理和性能监控
 */
import { log } from '@/utils/logger.js';

export interface AdvancedCacheConfig {
  maxSize: number;
  maxMemoryUsage: number;
  cleanupInterval: number;
  memoryPressureThreshold: number; // 内存压力阈值 (0-1)
  aggressiveCleanupInterval: number; // 激进清理间隔
  lruEvictionEnabled: boolean;
  adaptiveCleanup: boolean;
}

export interface MemoryStats {
  usedMemory: number;
  maxMemory: number;
  pressureLevel: number; // 0-1，1表示最高压力
  isUnderPressure: boolean;
}

export interface CachePerformanceMetrics {
  totalOperations: number;
  hitRate: number;
  averageAccessTime: number;
  memoryEfficiency: number;
  evictionCount: number;
  lastCleanupTime: number;
}

/**
 * 增强的缓存清理策略
 */
export class AdvancedCacheManager {
  private memoryUsage = 0;
  private config: AdvancedCacheConfig;
  private metrics: CachePerformanceMetrics;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<AdvancedCacheConfig> = {}) {
    this.config = {
      maxSize: 1000,
      maxMemoryUsage: 50 * 1024 * 1024, // 50MB
      cleanupInterval: 300000, // 5分钟
      memoryPressureThreshold: 0.8,
      aggressiveCleanupInterval: 60000, // 1分钟
      lruEvictionEnabled: true,
      adaptiveCleanup: true,
      ...config,
    };

    this.metrics = {
      totalOperations: 0,
      hitRate: 0,
      averageAccessTime: 0,
      memoryEfficiency: 0,
      evictionCount: 0,
      lastCleanupTime: Date.now(),
    };

    this.startCleanupScheduler();
  }

  /**
   * 获取当前内存状态
   */
  getMemoryStats(): MemoryStats {
    const usedMemory = this.memoryUsage;
    const maxMemory = this.config.maxMemoryUsage;
    const pressureLevel = Math.min(1, usedMemory / maxMemory);
    
    return {
      usedMemory,
      maxMemory,
      pressureLevel,
      isUnderPressure: pressureLevel > this.config.memoryPressureThreshold,
    };
  }

  /**
   * 获取性能指标
   */
  getPerformanceMetrics(): CachePerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * 智能清理策略
   */
  performIntelligentCleanup(): {
    itemsRemoved: number;
    memoryFreed: number;
    strategy: string;
  } {
    const startTime = Date.now();
    const memoryStats = this.getMemoryStats();
    let itemsRemoved = 0;
    let memoryFreed = 0;
    let strategy = 'normal';

    log.debug('Starting intelligent cache cleanup', {
      memoryUsage: memoryStats.usedMemory,
      pressureLevel: memoryStats.pressureLevel,
      isUnderPressure: memoryStats.isUnderPressure,
    });

    if (memoryStats.isUnderPressure) {
      // 激进清理模式
      strategy = 'aggressive';
      const result = this.aggressiveCleanup();
      itemsRemoved = result.itemsRemoved;
      memoryFreed = result.memoryFreed;
    } else {
      // 常规清理模式
      strategy = 'normal';
      const result = this.normalCleanup();
      itemsRemoved = result.itemsRemoved;
      memoryFreed = result.memoryFreed;
    }

    // 更新指标
    this.metrics.evictionCount += itemsRemoved;
    this.metrics.lastCleanupTime = Date.now();
    this.memoryUsage = Math.max(0, this.memoryUsage - memoryFreed);

    const duration = Date.now() - startTime;
    log.info(`Cache cleanup completed`, {
      strategy,
      itemsRemoved,
      memoryFreed,
      duration,
      newMemoryUsage: this.memoryUsage,
    });

    return { itemsRemoved, memoryFreed, strategy };
  }

  /**
   * 常规清理：移除过期项
   */
  private normalCleanup(): { itemsRemoved: number; memoryFreed: number } {
    // 这里应该调用具体缓存实例的清理方法
    // 由于这是一个管理器，实际的清理逻辑应该委托给具体的缓存实例
    return { itemsRemoved: 0, memoryFreed: 0 };
  }

  /**
   * 激进清理：移除过期项 + LRU淘汰
   */
  private aggressiveCleanup(): { itemsRemoved: number; memoryFreed: number } {
    // 激进清理策略
    // 1. 移除所有过期项
    // 2. LRU淘汰最近最少使用的项
    // 3. 如果还有压力，移除大内存占用项
    return { itemsRemoved: 0, memoryFreed: 0 };
  }

  /**
   * 估算对象内存占用
   */
  estimateMemoryUsage(obj: any): number {
    if (obj === null || obj === undefined) return 0;
    
    if (typeof obj === 'string') {
      return obj.length * 2; // UTF-16编码
    }
    
    if (typeof obj === 'number') {
      return 8; // 64位数字
    }
    
    if (typeof obj === 'boolean') {
      return 4;
    }
    
    if (obj instanceof Date) {
      return 24;
    }
    
    if (Array.isArray(obj)) {
      return obj.reduce((total, item) => total + this.estimateMemoryUsage(item), 0) + 24;
    }
    
    if (typeof obj === 'object') {
      let size = 24; // 对象基础开销
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          size += key.length * 2; // 键名
          size += this.estimateMemoryUsage(obj[key]); // 值
        }
      }
      return size;
    }
    
    return 0;
  }

  /**
   * 记录内存使用
   */
  recordMemoryUsage(delta: number): void {
    this.memoryUsage += delta;

    // 如果内存使用超过阈值，触发清理
    if (this.getMemoryStats().isUnderPressure) {
      log.warn('Memory pressure detected, triggering cleanup', {
        currentUsage: this.memoryUsage,
        maxUsage: this.config.maxMemoryUsage,
        pressureLevel: this.getMemoryStats().pressureLevel,
      });
      
      // 异步执行清理，避免阻塞
      setTimeout(() => this.performIntelligentCleanup(), 0);
    }
  }

  /**
   * 启动清理调度器
   */
  private startCleanupScheduler(): void {
    const interval = this.config.adaptiveCleanup && this.getMemoryStats().isUnderPressure
      ? this.config.aggressiveCleanupInterval
      : this.config.cleanupInterval;

    this.cleanupTimer = setTimeout(() => {
      this.performIntelligentCleanup();
      this.startCleanupScheduler(); // 重新调度
    }, interval);
  }

  /**
   * 停止清理调度器
   */
  stopCleanupScheduler(): void {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * 重置统计信息
   */
  resetMetrics(): void {
    this.metrics = {
      totalOperations: 0,
      hitRate: 0,
      averageAccessTime: 0,
      memoryEfficiency: 0,
      evictionCount: 0,
      lastCleanupTime: Date.now(),
    };
  }

  /**
   * 获取配置信息
   */
  getConfig(): AdvancedCacheConfig {
    return { ...this.config };
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    this.stopCleanupScheduler();
    this.resetMetrics();
    this.memoryUsage = 0;
    
    log.info('Advanced cache manager destroyed');
  }
}

/**
 * 全局缓存管理器实例
 */
let globalCacheManager: AdvancedCacheManager | null = null;

export function getGlobalCacheManager(): AdvancedCacheManager {
  if (!globalCacheManager) {
    globalCacheManager = new AdvancedCacheManager();
  }
  return globalCacheManager;
}

export function createCacheManager(config: Partial<AdvancedCacheConfig>): AdvancedCacheManager {
  return new AdvancedCacheManager(config);
}

/**
 * 缓存健康检查工具
 */
export class CacheHealthChecker {
  static checkHealth(manager: AdvancedCacheManager): {
    isHealthy: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    const memoryStats = manager.getMemoryStats();
    const metrics = manager.getPerformanceMetrics();

    // 检查内存压力
    if (memoryStats.isUnderPressure) {
      issues.push(`High memory pressure: ${(memoryStats.pressureLevel * 100).toFixed(1)}%`);
      recommendations.push('Consider reducing cache size or enabling more aggressive cleanup');
    }

    // 检查命中率
    if (metrics.hitRate < 0.5) {
      issues.push(`Low cache hit rate: ${(metrics.hitRate * 100).toFixed(1)}%`);
      recommendations.push('Review cache TTL settings and access patterns');
    }

    // 检查清理频率
    const timeSinceLastCleanup = Date.now() - metrics.lastCleanupTime;
    if (timeSinceLastCleanup > 600000) { // 10分钟
      issues.push('Cache cleanup has not run recently');
      recommendations.push('Check cleanup scheduler and memory management');
    }

    return {
      isHealthy: issues.length === 0,
      issues,
      recommendations,
    };
  }
}