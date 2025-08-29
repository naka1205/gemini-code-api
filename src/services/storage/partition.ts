import { log } from '../../utils/logger.js';

/**
 * 分区策略接口
 */
export interface PartitionStrategy {
  name: string;
  description: string;
  enabled: boolean;
  retentionDays: number;
  archiveEnabled: boolean;
  archiveLocation: 'cold_storage' | 'compressed' | 'deleted';
}

/**
 * 分区操作结果
 */
export interface PartitionResult {
  success: boolean;
  operation: 'archive' | 'cleanup' | 'compress';
  recordsProcessed: number;
  recordsArchived: number;
  recordsDeleted: number;
  storageSaved: number; // 字节
  error?: string;
}

/**
 * 数据分区管理器
 * 负责管理历史数据归档、冷热数据分离和数据生命周期
 */
export class DataPartitionManager {
  private db: D1Database;
  private strategies: Map<string, PartitionStrategy>;

  constructor(db: D1Database) {
    this.db = db;
    this.strategies = new Map();
    this.initializeDefaultStrategies();
  }

  /**
   * 初始化默认分区策略
   */
  private initializeDefaultStrategies(): void {
    // 请求日志分区策略
    this.strategies.set('request_logs', {
      name: 'request_logs',
      description: '请求日志数据分区策略',
      enabled: true,
      retentionDays: 30, // 保留30天
      archiveEnabled: true,
      archiveLocation: 'compressed',
    });

    // API密钥指标分区策略
    this.strategies.set('api_key_metrics', {
      name: 'api_key_metrics',
      description: 'API密钥指标数据分区策略',
      enabled: true,
      retentionDays: 90, // 保留90天
      archiveEnabled: true,
      archiveLocation: 'compressed',
    });

    // 系统统计分区策略
    this.strategies.set('system_stats', {
      name: 'system_stats',
      description: '系统统计数据分区策略',
      enabled: true,
      retentionDays: 365, // 保留1年
      archiveEnabled: false,
      archiveLocation: 'deleted',
    });

    // 错误日志分区策略
    this.strategies.set('error_logs', {
      name: 'error_logs',
      description: '错误日志数据分区策略',
      enabled: true,
      retentionDays: 7, // 保留7天
      archiveEnabled: false,
      archiveLocation: 'deleted',
    });
  }

  /**
   * 获取分区策略
   */
  getStrategy(tableName: string): PartitionStrategy | undefined {
    return this.strategies.get(tableName);
  }

  /**
   * 更新分区策略
   */
  updateStrategy(tableName: string, strategy: Partial<PartitionStrategy>): void {
    const existing = this.strategies.get(tableName);
    if (existing) {
      this.strategies.set(tableName, { ...existing, ...strategy });
      log.info('Partition strategy updated', { tableName, strategy });
    }
  }

  /**
   * 执行数据分区操作
   */
  async executePartitioning(): Promise<PartitionResult[]> {
    const results: PartitionResult[] = [];

    for (const [tableName, strategy] of this.strategies) {
      if (!strategy.enabled) {
        continue;
      }

      try {
        const result = await this.partitionTable(tableName, strategy);
        results.push(result);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error('Partitioning failed for table', { tableName, error: errorMessage } as any);
        
        results.push({
          success: false,
          operation: 'archive',
          recordsProcessed: 0,
          recordsArchived: 0,
          recordsDeleted: 0,
          storageSaved: 0,
          error: errorMessage,
        });
      }
    }

    return results;
  }

  /**
   * 分区单个表
   */
  private async partitionTable(tableName: string, strategy: PartitionStrategy): Promise<PartitionResult> {
    const cutoffTime = Date.now() - (strategy.retentionDays * 24 * 60 * 60 * 1000);
    
    try {
      // 获取需要分区的记录数量
      const countQuery = `
        SELECT COUNT(*) as count
        FROM ${tableName}
        WHERE timestamp < ?
      `;
      
      const countResult = await this.db
        .prepare(countQuery)
        .bind(cutoffTime)
        .first<{ count: number }>();
      
      const recordsToProcess = countResult?.count || 0;
      
      if (recordsToProcess === 0) {
        return {
          success: true,
          operation: 'archive',
          recordsProcessed: 0,
          recordsArchived: 0,
          recordsDeleted: 0,
          storageSaved: 0,
        };
      }

      let recordsArchived = 0;
      let recordsDeleted = 0;
      let storageSaved = 0;

      if (strategy.archiveEnabled && strategy.archiveLocation === 'compressed') {
        // 归档到压缩存储（这里我们只是删除，实际生产环境可能需要更复杂的归档逻辑）
        const archiveResult = await this.archiveRecords(tableName, cutoffTime);
        recordsArchived = archiveResult.recordsArchived;
        storageSaved = archiveResult.storageSaved;
      } else {
        // 直接删除过期记录
        const deleteResult = await this.deleteExpiredRecords(tableName, cutoffTime);
        recordsDeleted = deleteResult.recordsDeleted;
        storageSaved = deleteResult.storageSaved;
      }

      log.info('Table partitioning completed', {
        tableName,
        recordsProcessed: recordsToProcess,
        recordsArchived,
        recordsDeleted,
        storageSaved,
        strategy: strategy.name,
      });

      return {
        success: true,
        operation: strategy.archiveEnabled ? 'archive' : 'cleanup',
        recordsProcessed: recordsToProcess,
        recordsArchived,
        recordsDeleted,
        storageSaved,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error('Table partitioning failed', { tableName, error: errorMessage } as any);
      
      return {
        success: false,
        operation: 'archive',
        recordsProcessed: 0,
        recordsArchived: 0,
        recordsDeleted: 0,
        storageSaved: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * 归档记录
   */
  private async archiveRecords(tableName: string, cutoffTime: number): Promise<{
    recordsArchived: number;
    storageSaved: number;
  }> {
    // 在实际生产环境中，这里应该将数据移动到冷存储
    // 由于Cloudflare Workers的限制，我们这里只是删除数据
    // 但记录归档操作
    
    const deleteQuery = `
      DELETE FROM ${tableName}
      WHERE timestamp < ?
    `;
    
    const result = await this.db
      .prepare(deleteQuery)
      .bind(cutoffTime)
      .run();
    
    const recordsArchived = result.meta?.changes || 0;
    const storageSaved = recordsArchived * 1024; // 估算每记录1KB
    
    log.info('Records archived', {
      tableName,
      recordsArchived,
      storageSaved,
      cutoffTime: new Date(cutoffTime).toISOString(),
    });
    
    return { recordsArchived, storageSaved };
  }

  /**
   * 删除过期记录
   */
  private async deleteExpiredRecords(tableName: string, cutoffTime: number): Promise<{
    recordsDeleted: number;
    storageSaved: number;
  }> {
    const deleteQuery = `
      DELETE FROM ${tableName}
      WHERE timestamp < ?
    `;
    
    const result = await this.db
      .prepare(deleteQuery)
      .bind(cutoffTime)
      .run();
    
    const recordsDeleted = result.meta?.changes || 0;
    const storageSaved = recordsDeleted * 1024; // 估算每记录1KB
    
    log.info('Expired records deleted', {
      tableName,
      recordsDeleted,
      storageSaved,
      cutoffTime: new Date(cutoffTime).toISOString(),
    });
    
    return { recordsDeleted, storageSaved };
  }

  /**
   * 获取表大小统计
   */
  async getTableStats(): Promise<Map<string, {
    totalRecords: number;
    estimatedSize: number;
    oldestRecord: number;
    newestRecord: number;
  }>> {
    const stats = new Map();
    
    for (const tableName of this.strategies.keys()) {
      try {
        const countQuery = `
          SELECT 
            COUNT(*) as total_records,
            MIN(timestamp) as oldest_record,
            MAX(timestamp) as newest_record
          FROM ${tableName}
        `;
        
        const result = await this.db
          .prepare(countQuery)
          .first<{
            total_records: number;
            oldest_record: number;
            newest_record: number;
          }>();
        
        if (result) {
          const estimatedSize = result.total_records * 1024; // 估算每记录1KB
          
          stats.set(tableName, {
            totalRecords: result.total_records,
            estimatedSize,
            oldestRecord: result.oldest_record || 0,
            newestRecord: result.newest_record || 0,
          });
        }
      } catch (error) {
        log.warn('Failed to get table stats', { tableName, error });
      }
    }
    
    return stats;
  }

  /**
   * 获取分区建议
   */
  async getPartitionRecommendations(): Promise<Array<{
    tableName: string;
    recommendation: string;
    priority: 'low' | 'medium' | 'high';
    estimatedSavings: number;
  }>> {
    const recommendations: Array<{
      tableName: string;
      recommendation: string;
      priority: 'low' | 'medium' | 'high';
      estimatedSavings: number;
    }> = [];
    
    const stats = await this.getTableStats();
    
    for (const [tableName, stat] of stats) {
      const strategy = this.strategies.get(tableName);
      if (!strategy) continue;
      
      const cutoffTime = Date.now() - (strategy.retentionDays * 24 * 60 * 60 * 1000);
      const expiredRecords = stat.oldestRecord < cutoffTime ? stat.totalRecords : 0;
      const estimatedSavings = expiredRecords * 1024;
      
      if (expiredRecords > 0) {
        let priority: 'low' | 'medium' | 'high' = 'low';
        if (expiredRecords > 10000) priority = 'high';
        else if (expiredRecords > 1000) priority = 'medium';
        
        recommendations.push({
          tableName,
          recommendation: `建议清理 ${expiredRecords} 条过期记录，预计节省 ${(estimatedSavings / 1024 / 1024).toFixed(2)} MB 存储空间`,
          priority,
          estimatedSavings,
        });
      }
    }
    
    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; issues: string[] }> {
    const issues: string[] = [];
    
    try {
      // 检查数据库连接
      await this.db.prepare('SELECT 1').first();
      
      // 检查表是否存在
      for (const tableName of this.strategies.keys()) {
        try {
          await this.db.prepare(`SELECT COUNT(*) FROM ${tableName}`).first();
        } catch (error) {
          issues.push(`表 ${tableName} 不存在或无法访问`);
        }
      }
      
      // 检查分区策略
      const recommendations = await this.getPartitionRecommendations();
      const highPriorityRecommendations = recommendations.filter(r => r.priority === 'high');
      
      if (highPriorityRecommendations.length > 0) {
        issues.push(`${highPriorityRecommendations.length} 个高优先级分区建议待处理`);
      }
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      if (issues.length > 5) {
        status = 'unhealthy';
      } else if (issues.length > 0) {
        status = 'degraded';
      }
      
      return { status, issues };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        issues: ['数据库连接失败'],
      };
    }
  }
}
