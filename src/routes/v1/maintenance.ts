/**
 * 数据库维护路由
 * 提供数据库清理、统计生成等维护功能
 */
import { Hono } from 'hono';
import { DatabaseOperations } from '../../database/operations.js';
import { DatabaseMaintenanceService } from '../../services/storage/maintenance.js';
import { log } from '../../utils/logger.js';
import { throwError } from '../../middleware/error-handler.js';

const maintenance = new Hono();

// 初始化数据库操作和维护服务
let dbOps: DatabaseOperations;
let maintenanceService: DatabaseMaintenanceService;

maintenance.use('*', async (c, next) => {
  if (!dbOps) {
    const { drizzle } = await import('drizzle-orm/d1');
    dbOps = new DatabaseOperations(drizzle((c.env as any).DB));
    maintenanceService = new DatabaseMaintenanceService(dbOps);
  }
  await next();
});

/**
 * 执行数据库维护任务
 * POST /v1/maintenance/perform
 */
maintenance.post('/perform', async (c) => {
  try {
    log.info('收到数据库维护请求');
    
    await maintenanceService.performMaintenance();
    
    return c.json({
      success: true,
      message: '数据库维护任务执行完成',
      timestamp: Date.now()
    });
  } catch (error) {
    log.error('数据库维护失败', error as Error);
    throw throwError.internal('数据库维护失败');
  }
});

/**
 * 生成指定日期的统计
 * POST /v1/maintenance/stats/:date
 */
maintenance.post('/stats/:date', async (c) => {
  try {
    const date = c.req.param('date');
    
    // 验证日期格式
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw throwError.validation('日期格式无效，请使用 YYYY-MM-DD 格式');
    }
    
    log.info('收到统计生成请求', { date });
    
    const success = await maintenanceService.generateStatsForDate(date);
    
    if (success) {
      return c.json({
        success: true,
        message: `统计生成成功`,
        date,
        timestamp: Date.now()
      });
    } else {
      throw throwError.internal('统计生成失败');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('日期格式无效')) {
      throw error;
    }
    log.error('统计生成失败', error as Error);
    throw throwError.internal('统计生成失败');
  }
});

/**
 * 清理指定天数前的数据
 * POST /v1/maintenance/cleanup
 */
maintenance.post('/cleanup', async (c) => {
  try {
    const body = await c.req.json();
    const days = body.days || 30;
    
    if (typeof days !== 'number' || days < 1 || days > 365) {
      throw throwError.validation('天数必须在 1-365 之间');
    }
    
    log.info('收到数据清理请求', { days });
    
    const deletedCount = await maintenanceService.cleanupDataOlderThan(days);
    
    return c.json({
      success: true,
      message: '数据清理完成',
      deletedCount,
      days,
      timestamp: Date.now()
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('天数必须在')) {
      throw error;
    }
    log.error('数据清理失败', error as Error);
    throw throwError.internal('数据清理失败');
  }
});

/**
 * 获取数据库健康状态
 * GET /v1/maintenance/health
 */
maintenance.get('/health', async (c) => {
  try {
    log.info('收到数据库健康检查请求');
    
    const health = await maintenanceService.getDatabaseHealth();
    
    return c.json({
      success: true,
      data: health,
      timestamp: Date.now()
    });
  } catch (error) {
    log.error('数据库健康检查失败', error as Error);
    throw throwError.internal('数据库健康检查失败');
  }
});

/**
 * 获取数据库统计信息
 * GET /v1/maintenance/stats
 */
maintenance.get('/stats', async (c) => {
  try {
    log.info('收到数据库统计请求');
    
    const statsResult = await dbOps.getDatabaseStats();
    
    if (statsResult.success) {
      return c.json({
        success: true,
        data: statsResult.data,
        timestamp: Date.now()
      });
    } else {
      throw throwError.internal('获取数据库统计失败');
    }
  } catch (error) {
    log.error('获取数据库统计失败', error as Error);
    throw throwError.internal('获取数据库统计失败');
  }
});

/**
 * 优化数据库性能
 * POST /v1/maintenance/optimize
 */
maintenance.post('/optimize', async (c) => {
  try {
    log.info('收到数据库优化请求');
    
    const result = await dbOps.optimizeDatabase();
    
    if (result.success) {
      return c.json({
        success: true,
        message: '数据库优化完成',
        timestamp: Date.now()
      });
    } else {
      throw throwError.internal('数据库优化失败');
    }
  } catch (error) {
    log.error('数据库优化失败', error as Error);
    throw throwError.internal('数据库优化失败');
  }
});

export default maintenance;
