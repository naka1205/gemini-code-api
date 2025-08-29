/**
 * 配额管理器
 * 基于现有数据库查询配额使用情况
 */

import type { D1Database } from '@cloudflare/workers-types';
import { hashApiKey } from '../../utils/helpers.js';
import { log } from '../../utils/logger.js';
import type { BlacklistManager } from './blacklist.js';
import { getGlobalPerformanceMonitor } from '../monitor/performance.js';

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
  private blacklistManager: BlacklistManager | undefined;

  constructor(db: D1Database, blacklistManager?: BlacklistManager) {
    this.db = db;
    this.blacklistManager = blacklistManager;
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
    
    const monitor = getGlobalPerformanceMonitor();
    
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
      
      const startTime = Date.now();
      const minuteResult = await this.db
        .prepare(minuteQuery)
        .bind(keyHash, model, currentMinute)
        .first<{ rpm: number; tpm: number }>();
      const queryTime = Date.now() - startTime;
      
      // 记录数据库操作
      monitor.recordDBOperation(true, queryTime > 1000); // 超过1秒认为是慢查询
      
      // 查询今日的请求数
      const dayQuery = `
        SELECT COUNT(*) as rpd
        FROM request_logs 
        WHERE api_key_hash = ? 
          AND model = ? 
          AND timestamp >= ?
      `;
      
      const dayStartTime = Date.now();
      const dayResult = await this.db
        .prepare(dayQuery)
        .bind(keyHash, model, todayStart)
        .first<{ rpd: number }>();
      const dayQueryTime = Date.now() - dayStartTime;
      
      // 记录数据库操作
      monitor.recordDBOperation(true, dayQueryTime > 1000);
      
      return {
        rpm: minuteResult?.rpm || 0,
        tpm: minuteResult?.tpm || 0,
        rpd: dayResult?.rpd || 0,
        lastMinute: currentMinute,
        lastDay: todayStart,
      };
      
    } catch (error) {
      // 记录数据库错误
      monitor.recordDBOperation(false);
      
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
      // 自动添加到黑名单
      await this.addToBlacklistIfNeeded(apiKey, 'rpm_exceeded', { model });
      return {
        available: false,
        reason: 'rpm_exceeded',
        usage,
      };
    }
    
    // 检查TPM限制
    if (usage.tpm + estimatedTokens >= limits.tpm) {
      // 自动添加到黑名单
      await this.addToBlacklistIfNeeded(apiKey, 'tpm_exceeded', { model });
      return {
        available: false,
        reason: 'tpm_exceeded',
        usage,
      };
    }
    
    // 检查RPD限制
    if (usage.rpd >= limits.rpd) {
      // 自动添加到黑名单
      await this.addToBlacklistIfNeeded(apiKey, 'rpd_exceeded', { model });
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
   * 如果配额超限，自动添加到黑名单
   */
  private async addToBlacklistIfNeeded(
    apiKey: string,
    reason: 'rpm_exceeded' | 'tpm_exceeded' | 'rpd_exceeded',
    metadata?: { model?: string }
  ): Promise<void> {
    if (!this.blacklistManager) {
      return; // 如果没有配置黑名单管理器，跳过
    }

    try {
      const result = await this.blacklistManager.addToBlacklist(apiKey, reason as any, metadata);
      if (result.success) {
        log.info('API key automatically added to blacklist due to quota exceeded', {
          keyHash: result.keyHash.substring(0, 8) + '...',
          reason,
          metadata,
        });
      }
    } catch (error) {
      log.warn('Failed to add API key to blacklist', {
        keyHash: hashApiKey(apiKey).substring(0, 8) + '...',
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    }
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

  /**
   * 记录API使用情况
   */
  async recordUsage(
    apiKey: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    context?: {
      originalModel?: string;
      endpoint?: string;
      clientType?: string;
      statusCode?: number;
      responseTimeMs?: number;
      clientIP?: string;
      userAgent?: string;
      isStream?: boolean;
      requestSize?: number;
      responseSize?: number;
    }
  ): Promise<void> {
    const keyHash = hashApiKey(apiKey);
    const now = Date.now();
    const totalTokens = inputTokens + outputTokens;
    
    try {
      // 插入请求日志（补全非空字段并生成ID）
      // 注意：此处缺少请求上下文（client_type、client_ip、endpoint 等），
      // 先使用安全的占位默认值，后续在路由层补充真实值。
      const insertQuery = `
        INSERT INTO request_logs (
          id,
          timestamp,
          client_type,
          client_ip,
          api_key_hash,
          model,
          original_model,
          endpoint,
          user_agent,
          response_time,
          status_code,
          input_tokens,
          output_tokens,
          total_tokens,
          is_stream,
          has_error,
          request_size,
          response_size
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      // 延迟导入以避免循环依赖
      const { generateRequestId } = await import('../../utils/helpers.js');
      const generatedId = generateRequestId();
      const clientType = context?.clientType || 'openai';
      const clientIP = context?.clientIP || 'unknown';
      const endpoint = context?.endpoint || '/v1/chat/completions';
      const responseTime = context?.responseTimeMs ?? 0;
      const statusCode = context?.statusCode ?? 200;
      const isStream = context?.isStream ? 1 : 0;
      const originalModel = context?.originalModel || model;
      const userAgent = context?.userAgent ?? '';
      const requestSize = (context as any)?.requestSize ?? 0;
      const responseSize = (context as any)?.responseSize ?? 0;
      const hasError = 0;

      await this.db
        .prepare(insertQuery)
        .bind(
          generatedId,
          now,
          clientType,
          clientIP,
          keyHash,
          model,
          originalModel,
          endpoint,
          userAgent,
          responseTime,
          statusCode,
          inputTokens,
          outputTokens,
          totalTokens,
          isStream,
          hasError,
          requestSize,
          responseSize,
        )
        .run();
      
      // 更新API密钥指标
      await this.updateApiKeyMetrics(apiKey, model, {
        inputTokens,
        outputTokens,
        totalTokens,
        timestamp: now,
      });
      
      log.debug('Usage recorded successfully', {
        keyHash: keyHash.substring(0, 8) + '...',
        model,
        inputTokens,
        outputTokens,
        totalTokens,
      });
      
    } catch (error) {
      log.error('Error recording usage', error instanceof Error ? error : undefined, {
        keyHash: keyHash.substring(0, 8) + '...',
        model,
        inputTokens,
        outputTokens,
      });
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 更新API密钥指标
   */
  private async updateApiKeyMetrics(
    apiKey: string,
    model: string,
    metrics: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      timestamp: number;
    }
  ): Promise<void> {
    const keyHash = hashApiKey(apiKey);
    const now = Date.now();

    try {
      // 根据当前 schema（key_hash 主键）进行累加更新；若不存在则插入
      const updateQuery = `
        UPDATE api_key_metrics 
        SET 
          total_requests = COALESCE(total_requests, 0) + 1,
          successful_requests = COALESCE(successful_requests, 0) + 1,
          total_input_tokens = COALESCE(total_input_tokens, 0) + ?,
          total_output_tokens = COALESCE(total_output_tokens, 0) + ?,
          total_tokens = COALESCE(total_tokens, 0) + ?,
          last_response_time = ?,
          min_response_time = CASE 
            WHEN min_response_time IS NULL THEN ? 
            ELSE MIN(min_response_time, ?) 
          END,
          max_response_time = CASE 
            WHEN max_response_time IS NULL THEN ? 
            ELSE MAX(max_response_time, ?) 
          END,
          average_response_time = CASE 
            WHEN COALESCE(total_requests, 0) + 1 > 0 THEN 
              (COALESCE(average_response_time, 0) * COALESCE(total_requests, 0) + ?) / (COALESCE(total_requests, 0) + 1)
            ELSE COALESCE(average_response_time, 0)
          END,
          last_used = ?,
          updated_at = ?
        WHERE key_hash = ?
      `;

      const responseTime = metrics.timestamp ? 0 : 0; // 此处缺乏真实响应时间，默认0，占位

      const updateResult = await this.db
        .prepare(updateQuery)
        .bind(
          metrics.inputTokens,
          metrics.outputTokens,
          metrics.totalTokens,
          responseTime,
          responseTime, responseTime,
          responseTime, responseTime,
          responseTime,
          now,
          now,
          keyHash,
        )
        .run();

      if (!updateResult.meta || updateResult.meta.changes === 0) {
        const insertQuery = `
          INSERT INTO api_key_metrics (
            key_hash,
            total_requests,
            successful_requests,
            failed_requests,
            average_response_time,
            last_response_time,
            min_response_time,
            max_response_time,
            is_healthy,
            total_tokens,
            total_input_tokens,
            total_output_tokens,
            last_used,
            first_seen,
            created_at,
            updated_at
          ) VALUES (?, 1, 1, 0, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
        `;

        await this.db
          .prepare(insertQuery)
          .bind(
            keyHash,
            responseTime,
            responseTime,
            responseTime,
            responseTime,
            metrics.totalTokens,
            metrics.inputTokens,
            metrics.outputTokens,
            now,
            now,
            now,
            now,
          )
          .run();
      }

    } catch (error) {
      log.error('Error updating API key metrics', error instanceof Error ? error : undefined, {
        keyHash: keyHash.substring(0, 8) + '...',
        model,
      });
      // 不抛出错误，避免影响主流程
    }
  }
}
