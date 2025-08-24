/**
 * 数据库操作封装
 * 支持加密KEY存储和查询
 */
import { eq, desc, gte, lte, and, count } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { 
  requestLogs, 
  apiKeyMetrics, 
  systemStats, 
  errorLogs,
  type RequestLog,
  type NewRequestLog,
  type ApiKeyMetric,
  type NewApiKeyMetric,
  type SystemStat,
  type NewSystemStat,
  type ErrorLog,
  type NewErrorLog
} from './schema.js';
import type { ClientType, DatabaseResult, QueryOptions } from '../types/index.js';
import { generateId, hashApiKey } from '../utils/index.js';

export class DatabaseOperations {
  constructor(private db: DrizzleD1Database) {}

  // === 请求日志操作 ===

  /**
   * 记录请求日志
   */
  async logRequest(log: Omit<NewRequestLog, 'id'>): Promise<DatabaseResult<string>> {
    try {
      const id = generateId();
      const logData: NewRequestLog = {
        id,
        ...log,
        timestamp: Date.now(),
      };

      await this.db.insert(requestLogs).values(logData);
      
      return { success: true, data: id };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to log request: ${(error as Error).message}` 
      };
    }
  }

  /**
   * 根据加密KEY查询请求记录
   */
  async getRequestsByApiKey(
    encryptedKey: string,
    options: QueryOptions = {}
  ): Promise<DatabaseResult<RequestLog[]>> {
    try {
      const keyHash = hashApiKey(encryptedKey);
      const { limit = 100, offset = 0, orderBy = 'timestamp', orderDirection = 'DESC' } = options;

      const query = this.db
        .select()
        .from(requestLogs)
        .where(eq(requestLogs.apiKeyHash, keyHash));

      if (orderBy === 'timestamp') {
        query.orderBy(orderDirection === 'ASC' ? requestLogs.timestamp : desc(requestLogs.timestamp));
      }

      const results = await query
        .limit(limit)
        .offset(offset);

      return { success: true, data: results };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to query requests: ${(error as Error).message}` 
      };
    }
  }

  /**
   * 获取最近的请求日志
   */
  async getRecentRequests(limit: number = 100): Promise<DatabaseResult<RequestLog[]>> {
    try {
      const results = await this.db
        .select()
        .from(requestLogs)
        .orderBy(desc(requestLogs.timestamp))
        .limit(limit);

      return { success: true, data: results };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to get recent requests: ${(error as Error).message}` 
      };
    }
  }

  /**
   * 按时间范围查询请求
   */
  async getRequestsByTimeRange(
    startTime: number,
    endTime: number,
    filters: { clientType?: ClientType; hasError?: boolean } = {}
  ): Promise<DatabaseResult<RequestLog[]>> {
    try {
      let whereCondition = and(
        gte(requestLogs.timestamp, startTime),
        lte(requestLogs.timestamp, endTime)
      );

      if (filters.clientType) {
        whereCondition = and(whereCondition, eq(requestLogs.clientType, filters.clientType));
      }

      if (filters.hasError !== undefined) {
        whereCondition = and(whereCondition, eq(requestLogs.hasError, filters.hasError));
      }

      const results = await this.db
        .select()
        .from(requestLogs)
        .where(whereCondition)
        .orderBy(desc(requestLogs.timestamp));

      return { success: true, data: results };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to query by time range: ${(error as Error).message}` 
      };
    }
  }

  // === API密钥指标操作 ===

  /**
   * 更新API密钥性能指标
   */
  async updateApiKeyMetrics(
    apiKey: string,
    metrics: Partial<NewApiKeyMetric>
  ): Promise<DatabaseResult<void>> {
    try {
      const keyHash = hashApiKey(apiKey);
      const now = Date.now();

      const existing = await this.db
        .select()
        .from(apiKeyMetrics)
        .where(eq(apiKeyMetrics.keyHash, keyHash))
        .get();

      if (existing) {
        // 更新现有记录
        await this.db
          .update(apiKeyMetrics)
          .set({
            ...metrics,
            updatedAt: now,
          })
          .where(eq(apiKeyMetrics.keyHash, keyHash));
      } else {
        // 创建新记录
        const newMetrics: NewApiKeyMetric = {
          keyHash,
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          averageResponseTime: 0,
          consecutiveFailures: 0,
          totalTokens: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          isHealthy: true,
          createdAt: now,
          updatedAt: now,
          firstSeen: now,
          ...metrics,
        };

        await this.db.insert(apiKeyMetrics).values(newMetrics);
      }

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to update key metrics: ${(error as Error).message}` 
      };
    }
  }

  /**
   * 获取API密钥性能指标
   */
  async getApiKeyMetrics(apiKey: string): Promise<DatabaseResult<ApiKeyMetric | null>> {
    try {
      const keyHash = hashApiKey(apiKey);
      const result = await this.db
        .select()
        .from(apiKeyMetrics)
        .where(eq(apiKeyMetrics.keyHash, keyHash))
        .get();

      return { success: true, data: result || null };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to get key metrics: ${(error as Error).message}` 
      };
    }
  }

  /**
   * 获取所有健康的API密钥哈希
   */
  async getHealthyApiKeyHashes(): Promise<DatabaseResult<string[]>> {
    try {
      const results = await this.db
        .select({ keyHash: apiKeyMetrics.keyHash })
        .from(apiKeyMetrics)
        .where(eq(apiKeyMetrics.isHealthy, true));

      return { success: true, data: results.map(r => r.keyHash) };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to get healthy keys: ${(error as Error).message}` 
      };
    }
  }

  /**
   * 批量更新API密钥健康状态
   */
  async batchUpdateKeyHealth(keyHealthMap: Record<string, boolean>): Promise<DatabaseResult<void>> {
    try {
      const updates = Object.entries(keyHealthMap).map(([apiKey, isHealthy]) => {
        const keyHash = hashApiKey(apiKey);
        return this.db
          .update(apiKeyMetrics)
          .set({ 
            isHealthy, 
            lastHealthCheck: Date.now(),
            updatedAt: Date.now() 
          })
          .where(eq(apiKeyMetrics.keyHash, keyHash));
      });

      await Promise.all(updates);
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to batch update health: ${(error as Error).message}` 
      };
    }
  }

  // === 系统统计操作 ===

  /**
   * 更新每日系统统计
   */
  async updateDailyStats(date: string, stats: Partial<NewSystemStat>): Promise<DatabaseResult<void>> {
    try {
      const now = Date.now();
      const existing = await this.db
        .select()
        .from(systemStats)
        .where(eq(systemStats.date, date))
        .get();

      if (existing) {
        await this.db
          .update(systemStats)
          .set({
            ...stats,
            updatedAt: now,
          })
          .where(eq(systemStats.date, date));
      } else {
        const newStats: NewSystemStat = {
          date,
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          openaiRequests: 0,
          claudeRequests: 0,
          geminiRequests: 0,
          unknownRequests: 0,
          totalTokensUsed: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          averageResponseTime: 0,
          errorRate: 0,
          timeoutCount: 0,
          rateLimitCount: 0,
          authErrorCount: 0,
          totalRequestSize: 0,
          totalResponseSize: 0,
          streamRequestCount: 0,
          uniqueApiKeys: 0,
          activeApiKeys: 0,
          updatedAt: now,
          ...stats,
        };

        await this.db.insert(systemStats).values(newStats);
      }

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to update daily stats: ${(error as Error).message}` 
      };
    }
  }

  /**
   * 获取系统统计数据
   */
  async getSystemStats(dateRange?: { start: string; end: string }): Promise<DatabaseResult<SystemStat[]>> {
    try {
      let query = this.db.select().from(systemStats);

      if (dateRange) {
        query = query.where(
          and(
            gte(systemStats.date, dateRange.start),
            lte(systemStats.date, dateRange.end)
          )
        ) as any;
      }

      const results = await query.orderBy(desc(systemStats.date)).limit(30);
      return { success: true, data: results };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to get system stats: ${(error as Error).message}` 
      };
    }
  }

  // === 错误日志操作 ===

  /**
   * 记录错误日志
   */
  async logError(errorData: Omit<NewErrorLog, 'id' | 'createdAt'>): Promise<DatabaseResult<string>> {
    try {
      const id = generateId();
      const error: NewErrorLog = {
        id,
        ...errorData,
        timestamp: Date.now(),
        createdAt: Date.now(),
      };

      await this.db.insert(errorLogs).values(error);
      return { success: true, data: id };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to log error: ${(error as Error).message}` 
      };
    }
  }

  /**
   * 获取错误日志
   */
  async getErrorLogs(
    limit: number = 100,
    errorType?: string
  ): Promise<DatabaseResult<ErrorLog[]>> {
    try {
      let query = this.db.select().from(errorLogs);

      if (errorType) {
        query = query.where(eq(errorLogs.errorType, errorType)) as any;
      }

      const results = await query
        .orderBy(desc(errorLogs.timestamp))
        .limit(limit);

      return { success: true, data: results };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to get error logs: ${(error as Error).message}` 
      };
    }
  }

  // === 维护操作 ===

  /**
   * 清理旧数据
   */
  async cleanupOldData(retentionDays: number = 30): Promise<DatabaseResult<number>> {
    try {
      const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
      
      // 清理旧的请求日志
      const requestResult = await this.db
        .delete(requestLogs)
        .where(lte(requestLogs.timestamp, cutoffTime));

      // 清理旧的错误日志  
      const errorResult = await this.db
        .delete(errorLogs)
        .where(lte(errorLogs.timestamp, cutoffTime));

      const totalDeleted = ((requestResult as any).changes || 0) + ((errorResult as any).changes || 0);
      
      return { success: true, data: totalDeleted };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to cleanup old data: ${(error as Error).message}` 
      };
    }
  }

  /**
   * 获取数据库统计信息
   */
  async getDatabaseStats(): Promise<DatabaseResult<Record<string, number>>> {
    try {
      const [
        requestCount,
        keyMetricsCount,
        systemStatsCount,
        errorCount
      ] = await Promise.all([
        this.db.select({ count: count() }).from(requestLogs).get(),
        this.db.select({ count: count() }).from(apiKeyMetrics).get(),
        this.db.select({ count: count() }).from(systemStats).get(),
        this.db.select({ count: count() }).from(errorLogs).get(),
      ]);

      const stats = {
        requestLogs: requestCount?.count || 0,
        apiKeyMetrics: keyMetricsCount?.count || 0,
        systemStats: systemStatsCount?.count || 0,
        errorLogs: errorCount?.count || 0,
      };

      return { success: true, data: stats };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to get database stats: ${(error as Error).message}` 
      };
    }
  }
}