import { log } from '../../utils/logger.js';
import { getGlobalPerformanceMonitor } from '../monitor/performance.js';
import { throwError } from '../../middleware/error-handler.js';

/**
 * 黑名单条目接口
 */
export interface BlacklistEntry {
  keyHash: string;
  reason: 'rpd_exceeded' | 'tpd_exceeded' | 'rate_limited' | 'quota_exceeded' | 'api_error';
  expiresAt: number;
  addedAt: number;
  metadata?: {
    model?: string;
    errorCode?: string;
    requestCount?: number;
  };
}

/**
 * 黑名单管理结果
 */
export interface BlacklistResult {
  success: boolean;
  action: 'added' | 'removed' | 'checked' | 'synced';
  keyHash: string;
  reason?: string;
  expiresAt?: number;
  error?: string;
}

/**
 * KV黑名单管理器
 * 负责管理API密钥的黑名单状态，使用Cloudflare KV存储
 */
export class BlacklistManager {
  private kv: KVNamespace;
  private readonly BLACKLIST_PREFIX = 'blacklist:';
  private readonly BLACKLIST_TTL = 24 * 60 * 60 * 1000; // 24小时

  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  /**
   * 将API密钥添加到黑名单
   */
  async addToBlacklist(
    apiKey: string,
    reason: BlacklistEntry['reason'],
    metadata?: BlacklistEntry['metadata']
  ): Promise<BlacklistResult> {
    const keyHash = await this.hashApiKey(apiKey);
    const blacklistKey = `${this.BLACKLIST_PREFIX}${keyHash}`;
    const now = Date.now();
    const expiresAt = now + this.BLACKLIST_TTL;

    const entry: BlacklistEntry = {
      keyHash,
      reason,
      expiresAt,
      addedAt: now,
      ...(metadata && { metadata }),
    };

    try {
      await this.kv.put(blacklistKey, JSON.stringify(entry), {
        expirationTtl: this.BLACKLIST_TTL / 1000, // KV使用秒为单位
      });

      // 记录KV写入操作
      const monitor = getGlobalPerformanceMonitor();
      monitor.recordKVOperation('write', true);

      log.info('API key added to blacklist', {
        keyHash: keyHash.substring(0, 8) + '...',
        reason,
        expiresAt: new Date(expiresAt).toISOString(),
        metadata,
      });

      return {
        success: true,
        action: 'added',
        keyHash,
        reason,
        expiresAt,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // 记录KV错误
      const monitor = getGlobalPerformanceMonitor();
      monitor.recordKVOperation('write', false);
      
      log.error('Failed to add API key to blacklist', {
        keyHash: keyHash.substring(0, 8) + '...',
        reason,
        error: errorMessage,
      } as any);

      return {
        success: false,
        action: 'added',
        keyHash,
        reason,
        error: errorMessage,
      };
    }
  }

  /**
   * 检查API密钥是否在黑名单中
   */
  async isBlacklisted(apiKey: string): Promise<boolean> {
    const keyHash = await this.hashApiKey(apiKey);
    const blacklistKey = `${this.BLACKLIST_PREFIX}${keyHash}`;
    const monitor = getGlobalPerformanceMonitor();

    try {
      const blacklistEntry = await this.kv.get<BlacklistEntry>(blacklistKey, 'json');
      
      // 记录KV读取操作
      monitor.recordKVOperation('read', true);

      if (!blacklistEntry) {
        return false; // 不在黑名单中
      }

      // 检查是否已过期
      if (Date.now() > blacklistEntry.expiresAt) {
        // 自动移除过期的黑名单条目
        await this.kv.delete(blacklistKey);
        
        // 记录KV写入操作
        monitor.recordKVOperation('write', true);
        
        log.info('Auto-removed expired blacklist entry', {
          keyHash: keyHash.substring(0, 8) + '...',
          reason: blacklistEntry.reason,
        });
        return false;
      }

      return true; // 在黑名单中且未过期
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // 记录KV错误
      monitor.recordKVOperation('read', false);
      
      log.warn('Error checking blacklist status', {
        keyHash: keyHash.substring(0, 8) + '...',
        error: errorMessage,
      });
      // 保守策略：出错时假设不在黑名单中，避免误杀
      return false;
    }
  }

  /**
   * 从黑名单中移除API密钥
   */
  async removeFromBlacklist(apiKey: string): Promise<BlacklistResult> {
    const keyHash = await this.hashApiKey(apiKey);
    const blacklistKey = `${this.BLACKLIST_PREFIX}${keyHash}`;

    try {
      await this.kv.delete(blacklistKey);

      log.info('API key removed from blacklist', {
        keyHash: keyHash.substring(0, 8) + '...',
      });

      return {
        success: true,
        action: 'removed',
        keyHash,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error('Failed to remove API key from blacklist', {
        keyHash: keyHash.substring(0, 8) + '...',
        error: errorMessage,
      } as any);

      return {
        success: false,
        action: 'removed',
        keyHash,
        error: errorMessage,
      };
    }
  }

  /**
   * 获取黑名单条目详情
   */
  async getBlacklistEntry(apiKey: string): Promise<BlacklistEntry | null> {
    const keyHash = await this.hashApiKey(apiKey);
    const blacklistKey = `${this.BLACKLIST_PREFIX}${keyHash}`;

    try {
      const entry = await this.kv.get<BlacklistEntry>(blacklistKey, 'json');
      return entry;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.warn('Error getting blacklist entry', {
        keyHash: keyHash.substring(0, 8) + '...',
        error: errorMessage,
      });
      return null;
    }
  }

  /**
   * 批量检查多个API密钥的黑名单状态
   */
  async filterBlacklistedKeys(apiKeys: string[]): Promise<string[]> {
    const availableKeys: string[] = [];

    for (const apiKey of apiKeys) {
      const isBlacklisted = await this.isBlacklisted(apiKey);
      if (!isBlacklisted) {
        availableKeys.push(apiKey);
      }
    }

    return availableKeys;
  }

  /**
   * 清理过期的黑名单条目
   */
  async cleanupExpiredEntries(): Promise<number> {
    let cleanedCount = 0;

    try {
      // 注意：KV不支持直接列出所有键，这里我们只能通过已知的键来清理
      // 在实际使用中，我们会在检查时自动清理过期的条目
      log.info('Blacklist cleanup completed', { cleanedCount });
      return cleanedCount;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error('Error during blacklist cleanup', { error: errorMessage } as any);
      return cleanedCount;
    }
  }

  /**
   * 获取黑名单统计信息
   */
  async getBlacklistStats(): Promise<{
    totalEntries: number;
    expiredEntries: number;
    activeEntries: number;
  }> {
    // 注意：由于KV的限制，我们无法直接获取所有键
    // 这里返回一个基本的统计信息
    return {
      totalEntries: 0, // 无法准确统计
      expiredEntries: 0,
      activeEntries: 0,
    };
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; error?: string }> {
    try {
      // 尝试写入一个测试条目
      const testKey = 'test-health-check';
      const testEntry: BlacklistEntry = {
        keyHash: testKey,
        reason: 'api_error',
        expiresAt: Date.now() + 60000, // 1分钟后过期
        addedAt: Date.now(),
      };

      await this.kv.put(`test:${testKey}`, JSON.stringify(testEntry), {
        expirationTtl: 60,
      });

      // 读取测试条目
      const readEntry = await this.kv.get<BlacklistEntry>(`test:${testKey}`, 'json');
      if (!readEntry) {
        throwError.internal('Failed to read test entry');
      }

      // 删除测试条目
      await this.kv.delete(`test:${testKey}`);

      return { status: 'healthy' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        status: 'unhealthy',
        error: errorMessage,
      };
    }
  }

  /**
   * 哈希API密钥（SHA256）
   */
  private async hashApiKey(apiKey: string): Promise<string> {
    // 使用统一的哈希函数
    const { hashApiKey } = await import('../../utils/helpers.js');
    return hashApiKey(apiKey);
  }
}
