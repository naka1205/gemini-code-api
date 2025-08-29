/**
 * 数据库管理器
 * 负责数据库初始化、连接管理和表创建
 */
import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import { DatabaseOperations } from './operations.js';
import { log } from '../utils/logger.js';

export class DatabaseManager {
  private db: ReturnType<typeof drizzle>;
  private operations: DatabaseOperations;
  private isInitialized = false;

  constructor(d1Database: D1Database) {
    this.db = drizzle(d1Database);
    this.operations = new DatabaseOperations(this.db);
  }

  /**
   * 初始化数据库
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      return true;
    }

    try {
      log.info('Initializing database...');
      
      // 验证数据库连接
      await this.validateConnection();
      
      this.isInitialized = true;
      log.info('Database initialized successfully');
      return true;
    } catch (error) {
      log.error('Database initialization failed', error as Error);
      return false;
    }
  }

  /**
   * 验证数据库连接
   */
  private async validateConnection(): Promise<void> {
    try {
      // 尝试执行一个简单的查询来验证连接
      const stats = await this.operations.getDatabaseStats();
      if (stats.success) {
        log.info('Database connection validated', { stats: stats.data });
      } else {
        throw new Error(stats.error);
      }
    } catch (error) {
      throw new Error(`Database connection validation failed: ${(error as Error).message}`);
    }
  }

  /**
   * 获取数据库操作实例
   */
  getOperations(): DatabaseOperations {
    return this.operations;
  }

  /**
   * 获取原始数据库连接
   */
  getDatabase(): ReturnType<typeof drizzle> {
    return this.db;
  }

  /**
   * 检查数据库是否已初始化
   */
  isDatabaseInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    message: string;
    details?: any;
  }> {
    try {
      if (!this.isInitialized) {
        return {
          status: 'unhealthy',
          message: 'Database not initialized'
        };
      }

      const stats = await this.operations.getDatabaseStats();
      if (!stats.success) {
        return {
          status: 'unhealthy',
          message: 'Database stats query failed',
          details: stats.error
        };
      }

      return {
        status: 'healthy',
        message: 'Database connection is healthy',
        details: stats.data
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Database health check failed',
        details: (error as Error).message
      };
    }
  }

  /**
   * 清理旧数据
   */
  async cleanup(retentionDays: number = 30): Promise<{
    success: boolean;
    deletedCount: number;
    error?: string;
  }> {
    try {
      const result = await this.operations.cleanupOldData(retentionDays);
      if (result.success) {
        log.info('Database cleanup completed', { deletedCount: result.data });
        return {
          success: true,
          deletedCount: result.data || 0
        };
      } else {
                      return {
          success: false,
          deletedCount: 0,
          ...(result.error && { error: result.error })
        };
      }
    } catch (error) {
      log.error('Database cleanup failed', error as Error);
      return {
        success: false,
        deletedCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * 全局数据库管理器实例
 */
let globalDatabaseManager: DatabaseManager | null = null;

/**
 * 初始化全局数据库管理器
 */
export function initializeDatabase(d1Database: D1Database): DatabaseManager {
  if (!globalDatabaseManager) {
    globalDatabaseManager = new DatabaseManager(d1Database);
  }
  return globalDatabaseManager;
}

/**
 * 获取全局数据库管理器
 */
export function getGlobalDatabaseManager(): DatabaseManager {
  if (!globalDatabaseManager) {
    throw new Error('Database manager not initialized. Call initializeDatabase() first.');
  }
  return globalDatabaseManager;
}

/**
 * 获取全局数据库操作实例
 */
export function getGlobalDatabaseOperations(): DatabaseOperations {
  return getGlobalDatabaseManager().getOperations();
}
