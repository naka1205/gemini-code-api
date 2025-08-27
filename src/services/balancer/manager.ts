/**
 * 配额管理器
 * 基于现有数据库查询配额使用情况
 */

import type { D1Database } from '@cloudflare/workers-types';
import { hashApiKey } from '../../utils/helpers.js';
import { log } from '../../utils/logger.js';

interface QuotaUsage {
  rpm: number;
  tpm: number;
  rpd: number;
  lastMinute: number;
  lastDay: number;
}

/**
 * 配额管理器
 */
export class QuotaManager {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * 获取API密钥的配额使用情况
   */
  async getQuotaUsage(
    apiKey: string,
    model: string
  ): Promise<QuotaUsage> {
    const keyHash = hashApiKey(apiKey);
    const now = Date.now();
    
    // 计算时间窗口
    const currentMinute = Math.floor(now / 60000) * 60000;
    const todayStart = Math.floor(now / 86400000) * 86400000;
    
    try {
      // 查询当前分钟的请求数和token数
      const minuteQuery = `
        SELECT 
          COUNT(*) as rpm,
          COALESCE(SUM(total_tokens), 0) as tpm
        FROM request_logs 
        WHERE api_key_hash = ? 
          AND model = ? 
          AND timestamp >= ?
      `;
      
      const minuteResult = await this.db
        .prepare(minuteQuery)
        .bind(keyHash, model, currentMinute)
        .first<{ rpm: number; tpm: number }>();
      
      // 查询今日的请求数
      const dayQuery = `
        SELECT COUNT(*) as rpd
        FROM request_logs 
        WHERE api_key_hash = ? 
          AND model = ? 
          AND timestamp >= ?
      `;
      
      const dayResult = await this.db
        .prepare(dayQuery)
        .bind(keyHash, model, todayStart)
        .first<{ rpd: number }>();
      
      return {
        rpm: minuteResult?.rpm || 0,
        tpm: minuteResult?.tpm || 0,
        rpd: dayResult?.rpd || 0,
        lastMinute: currentMinute,
        lastDay: todayStart,
      };
      
    } catch (error) {
      log.error('Error querying quota usage', error instanceof Error ? error : undefined, {
        keyHash: keyHash.substring(0, 8) + '...',
        model,
      });
      
      // 返回默认值
      return {
        rpm: 0,
        tpm: 0,
        rpd: 0,
        lastMinute: currentMinute,
        lastDay: todayStart,
      };
    }
  }

  /**
   * 检查API密钥是否有足够的配额
   */
  async hasQuotaAvailable(
    apiKey: string,
    model: string,
    estimatedTokens: number = 0,
    limits: { rpm: number; tpm: number; rpd: number }
  ): Promise<{ available: boolean; reason?: string; usage: QuotaUsage }> {
    const usage = await this.getQuotaUsage(apiKey, model);
    
    // 检查RPM限制
    if (usage.rpm >= limits.rpm) {
      return {
        available: false,
        reason: 'rpm_exceeded',
        usage,
      };
    }
    
    // 检查TPM限制
    if (usage.tpm + estimatedTokens >= limits.tpm) {
      return {
        available: false,
        reason: 'tpm_exceeded',
        usage,
      };
    }
    
    // 检查RPD限制
    if (usage.rpd >= limits.rpd) {
      return {
        available: false,
        reason: 'rpd_exceeded',
        usage,
      };
    }
    
    return {
      available: true,
      usage,
    };
  }

  /**
   * 获取多个API密钥的配额状态
   */
  async getMultipleQuotaStatus(
    apiKeys: string[],
    model: string,
    limits: { rpm: number; tpm: number; rpd: number }
  ): Promise<Array<{
    apiKey: string;
    keyHash: string;
    usage: QuotaUsage;
    isAvailable: boolean;
    reason: string | undefined;
    score: number; // 配额评分，越高越好
  }>> {
    const results = [];
    
    for (const apiKey of apiKeys) {
      const keyHash = hashApiKey(apiKey);
      const quotaCheck = await this.hasQuotaAvailable(apiKey, model, 0, limits);
      
      // 计算配额评分
      let score = 0;
      if (quotaCheck.available) {
        const rpmScore = (limits.rpm - quotaCheck.usage.rpm) / limits.rpm;
        const tpmScore = (limits.tpm - quotaCheck.usage.tpm) / limits.tpm;
        const rpdScore = (limits.rpd - quotaCheck.usage.rpd) / limits.rpd;
        score = (rpmScore + tpmScore + rpdScore) / 3;
      }
      
      results.push({
        apiKey,
        keyHash,
        usage: quotaCheck.usage,
        isAvailable: quotaCheck.available,
        reason: quotaCheck.reason,
        score,
      });
    }
    
    // 按评分排序，评分高的在前
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * 清理过期的配额数据（可选，用于维护）
   */
  async cleanupOldData(daysToKeep: number = 7): Promise<number> {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    
    try {
      const result = await this.db
        .prepare('DELETE FROM request_logs WHERE timestamp < ?')
        .bind(cutoffTime)
        .run();
      
      log.info('Cleaned up old request logs', {
        deletedRows: result.meta?.changes || 0,
        cutoffTime: new Date(cutoffTime).toISOString(),
      });
      
      return result.meta?.changes || 0;
    } catch (error) {
      log.error('Error cleaning up old data', error instanceof Error ? error : undefined);
      return 0;
    }
  }
}
