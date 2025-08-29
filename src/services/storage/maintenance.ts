/**
 * 数据库维护服务
 * 负责定期清理、统计汇总和性能优化
 */
import { DatabaseOperations } from '../../database/operations.js';
import { QUOTA_CONFIG } from '../../utils/constants.js';
import { log } from '../../utils/logger.js';

export class DatabaseMaintenanceService {
  constructor(private dbOps: DatabaseOperations) {}

  /**
   * 执行定期维护任务
   */
  async performMaintenance(): Promise<void> {
    try {
      log.info('开始执行数据库维护任务');

      // 1. 清理过期数据
      const cleanupResult = await this.dbOps.batchCleanupOldData(
        QUOTA_CONFIG.CLEANUP_DAYS,
        QUOTA_CONFIG.BATCH_SIZE
      );

      if (cleanupResult.success) {
        log.info(`清理完成，删除了 ${cleanupResult.data} 条记录`);
      } else {
        log.error('清理失败', undefined, { error: cleanupResult.error });
      }

      // 2. 生成今日统计
      const today = new Date().toISOString().split('T')[0];
      const statsResult = await this.dbOps.generateDailyStats(today);

      if (statsResult.success) {
        log.info('今日统计生成完成', { date: today });
      } else {
        log.error('统计生成失败', undefined, { error: statsResult.error });
      }

      // 3. 优化数据库性能
      const optimizeResult = await this.dbOps.optimizeDatabase();

      if (optimizeResult.success) {
        log.info('数据库优化完成');
      } else {
        log.error('数据库优化失败', undefined, { error: optimizeResult.error });
      }

      // 4. 获取数据库统计信息
      const statsResult2 = await this.dbOps.getDatabaseStats();

      if (statsResult2.success) {
        log.info('数据库统计信息', statsResult2.data);
      } else {
        log.error('获取数据库统计失败', undefined, { error: statsResult2.error });
      }

      log.info('数据库维护任务完成');
    } catch (error) {
      log.error('数据库维护任务失败', error as Error);
    }
  }

  /**
   * 生成指定日期的统计
   */
  async generateStatsForDate(date: string): Promise<boolean> {
    try {
      const result = await this.dbOps.generateDailyStats(date);
      
      if (result.success) {
        log.info(`统计生成成功`, { date, stats: result.data });
        return true;
      } else {
        log.error(`统计生成失败`, undefined, { date, error: result.error });
        return false;
      }
    } catch (error) {
      log.error(`统计生成异常`, error as Error, { date });
      return false;
    }
  }

  /**
   * 清理指定天数前的数据
   */
  async cleanupDataOlderThan(days: number): Promise<number> {
    try {
      const result = await this.dbOps.batchCleanupOldData(days, QUOTA_CONFIG.BATCH_SIZE);
      
      if (result.success && result.data !== undefined) {
        log.info(`数据清理完成`, { days, deletedCount: result.data });
        return result.data;
      } else {
        log.error(`数据清理失败`, undefined, { days, error: result.error });
        return 0;
      }
    } catch (error) {
      log.error(`数据清理异常`, error as Error, { days });
      return 0;
    }
  }

  /**
   * 获取数据库健康状态
   */
  async getDatabaseHealth(): Promise<{
    isHealthy: boolean;
    stats: Record<string, number>;
    lastMaintenance?: number;
  }> {
    try {
      const statsResult = await this.dbOps.getDatabaseStats();
      
      if (!statsResult.success) {
        return {
          isHealthy: false,
          stats: {}
        };
      }

      const stats = statsResult.data;
      if (!stats) {
        return {
          isHealthy: false,
          stats: {}
        };
      }

      const isHealthy = stats.errorLogs < 1000 && stats.requestLogs > 0;

      return {
        isHealthy,
        stats,
        lastMaintenance: Date.now()
      };
    } catch (error) {
      log.error('获取数据库健康状态失败', error as Error);
      return {
        isHealthy: false,
        stats: {}
      };
    }
  }
}
