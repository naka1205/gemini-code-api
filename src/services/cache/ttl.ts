/**
 * TTL管理器
 * 专门处理缓存项的生存时间和自动过期
 */
import { log } from '../../utils/logger.js';

/**
 * TTL项接口
 */
export interface TTLItem {
  key: string;
  expiresAt: number;
  createdAt: number;
  ttl: number;
  callback?: () => void; // 过期回调
}

/**
 * TTL管理器类
 */
export class TTLManager {
  private items = new Map<string, TTLItem>();
  private timers = new Map<string, NodeJS.Timeout>();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private cleanupInterval: number;
  private timeProvider: () => number;

  constructor(
    cleanupInterval: number = 60000, // 默认1分钟清理一次
    timeProvider: () => number = Date.now // 可注入的时间提供者
  ) {
    this.cleanupInterval = cleanupInterval;
    this.timeProvider = timeProvider;
    this.startCleanupTimer();
  }

  /**
   * 设置TTL项
   */
  set(key: string, ttl: number, callback?: () => void): void {
    const now = this.timeProvider();
    const expiresAt = now + ttl;

    // 如果已存在，先清理
    this.delete(key);

    const item: TTLItem = {
      key,
      expiresAt,
      createdAt: now,
      ttl,
    };
    
    if (callback) {
      item.callback = callback;
    }

    this.items.set(key, item);

    // 设置单独的过期定时器
    const timer = setTimeout(() => {
      this.expire(key);
    }, ttl);

    this.timers.set(key, timer);
  }

  /**
   * 检查项是否过期
   */
  isExpired(key: string): boolean {
    const item = this.items.get(key);
    if (!item) {
      return true; // 不存在视为已过期
    }

    return item.expiresAt < this.timeProvider();
  }

  /**
   * 获取剩余时间（毫秒）
   */
  getRemainingTime(key: string): number {
    const item = this.items.get(key);
    if (!item) {
      return 0;
    }

    const remaining = item.expiresAt - this.timeProvider();
    return Math.max(0, remaining);
  }

  /**
   * 更新TTL（续期）
   */
  refresh(key: string, additionalTtl?: number): boolean {
    const item = this.items.get(key);
    if (!item) {
      return false;
    }

    // 清理旧定时器
    const oldTimer = this.timers.get(key);
    if (oldTimer) {
      clearTimeout(oldTimer);
    }

    // 使用原TTL或新TTL
    const newTtl = additionalTtl || item.ttl;
    const now = this.timeProvider();
    
    item.expiresAt = now + newTtl;
    item.ttl = newTtl;

    // 设置新定时器
    const timer = setTimeout(() => {
      this.expire(key);
    }, newTtl);

    this.timers.set(key, timer);
    
    return true;
  }

  /**
   * 延长TTL
   */
  extend(key: string, additionalTime: number): boolean {
    const item = this.items.get(key);
    if (!item) {
      return false;
    }

    item.expiresAt += additionalTime;
    item.ttl += additionalTime;

    // 更新定时器
    return this.refresh(key, item.ttl);
  }

  /**
   * 删除TTL项
   */
  delete(key: string): boolean {
    const item = this.items.get(key);
    if (!item) {
      return false;
    }

    // 清理定时器
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }

    this.items.delete(key);
    return true;
  }

  /**
   * 立即过期某个项
   */
  expire(key: string): boolean {
    const item = this.items.get(key);
    if (!item) {
      return false;
    }

    // 执行过期回调
    if (item.callback) {
      try {
        item.callback();
      } catch (error) {
        log.error(`TTL callback error for key ${key}:`, error as Error);
      }
    }

    // 删除项
    this.delete(key);
    return true;
  }

  /**
   * 获取所有活跃的key
   */
  getActiveKeys(): string[] {
    const now = this.timeProvider();
    const activeKeys: string[] = [];

    for (const [key, item] of this.items.entries()) {
      if (item.expiresAt > now) {
        activeKeys.push(key);
      }
    }

    return activeKeys;
  }

  /**
   * 获取所有过期的key
   */
  getExpiredKeys(): string[] {
    const now = this.timeProvider();
    const expiredKeys: string[] = [];

    for (const [key, item] of this.items.entries()) {
      if (item.expiresAt <= now) {
        expiredKeys.push(key);
      }
    }

    return expiredKeys;
  }

  /**
   * 获取TTL统计信息
   */
  getStats(): {
    totalItems: number;
    activeItems: number;
    expiredItems: number;
    oldestExpiration: number | null;
    newestExpiration: number | null;
  } {
    const now = this.timeProvider();
    let activeCount = 0;
    let expiredCount = 0;
    let oldestExpiration: number | null = null;
    let newestExpiration: number | null = null;

    for (const item of this.items.values()) {
      if (item.expiresAt > now) {
        activeCount++;
        if (!oldestExpiration || item.expiresAt < oldestExpiration) {
          oldestExpiration = item.expiresAt;
        }
        if (!newestExpiration || item.expiresAt > newestExpiration) {
          newestExpiration = item.expiresAt;
        }
      } else {
        expiredCount++;
      }
    }

    return {
      totalItems: this.items.size,
      activeItems: activeCount,
      expiredItems: expiredCount,
      oldestExpiration,
      newestExpiration,
    };
  }

  /**
   * 清理所有过期项
   */
  cleanup(): number {
    let cleanedCount = 0;
    const expiredKeys = this.getExpiredKeys();

    for (const key of expiredKeys) {
      this.expire(key);
      cleanedCount++;
    }

    return cleanedCount;
  }

  /**
   * 清空所有项
   */
  clear(): void {
    // 清理所有定时器
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }

    this.items.clear();
    this.timers.clear();
  }

  /**
   * 销毁TTL管理器
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    this.clear();
  }

  // === 私有方法 ===

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }
}

/**
 * 全局TTL管理器实例
 */
let globalTTLManager: TTLManager | null = null;

export function getGlobalTTLManager(): TTLManager {
  if (!globalTTLManager) {
    globalTTLManager = new TTLManager();
  }
  return globalTTLManager;
}

/**
 * TTL辅助函数
 */
export const TTLUtils = {
  /**
   * 将秒转换为毫秒
   */
  seconds(seconds: number): number {
    return seconds * 1000;
  },

  /**
   * 将分钟转换为毫秒
   */
  minutes(minutes: number): number {
    return minutes * 60 * 1000;
  },

  /**
   * 将小时转换为毫秒
   */
  hours(hours: number): number {
    return hours * 60 * 60 * 1000;
  },

  /**
   * 将天转换为毫秒
   */
  days(days: number): number {
    return days * 24 * 60 * 60 * 1000;
  },

  /**
   * 格式化剩余时间
   */
  formatRemainingTime(milliseconds: number): string {
    if (milliseconds <= 0) {
      return 'expired';
    }

    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  },
};