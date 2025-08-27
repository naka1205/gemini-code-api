/**
 * 健康检查路由
 * 提供系统状态和监控信息
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
// 注意：旧的load-balancer已被新的SmartLoadBalancer替代
// import { getGlobalMetricsCollector } from '../services/load-balancer/metrics.js';
import { API_CONFIG } from '../utils/constants.js';

/**
 * 系统健康状态
 */
interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  version: string;
  uptime: number;
  checks: {
    database: {
      status: 'up' | 'down';
      responseTime?: number;
      error?: string;
    };
    gemini_api: {
      status: 'up' | 'down';
      responseTime?: number;
      error?: string;
    };
    load_balancer: {
      status: 'up' | 'down';
      totalKeys: number;
      healthyKeys: number;
      unhealthyKeys: number;
    };
    memory: {
      status: 'ok' | 'high' | 'critical';
      usage?: number;
    };
  };
}

/**
 * 详细统计信息
 */
interface DetailedStats {
  system: {
    timestamp: number;
    uptime: number;
    version: string;
  };
  requests: {
    total: number;
    successful: number;
    failed: number;
    averageResponseTime: number;
    last24Hours: {
      total: number;
      successful: number;
      failed: number;
    };
  };
  loadBalancer: {
    totalKeys: number;
    healthyKeys: number;
    unhealthyKeys: number;
    averageResponseTime: number;
    keyPerformance: Array<{
      keyHash: string;
      requests: number;
      successRate: number;
      avgResponseTime: number;
      isHealthy: boolean;
    }>;
  };
  memory: {
    usage: number;
    limit: number;
    cacheSize: number;
  };
}

/**
 * 创建健康检查路由
 */
export function createHealthRoutes(): Hono {
  const app = new Hono();

  /**
   * 基础健康检查端点
   * GET /health
   */
  app.get('/', async (c: Context) => {
    const startTime = Date.now();
    
    try {
      const health = await performHealthChecks();
      const responseTime = Date.now() - startTime;
      
      // 根据健康状态设置HTTP状态码
      const httpStatus = health.status === 'healthy' ? 200 : 
                        health.status === 'degraded' ? 200 : 503;

      return c.json({
        ...health,
        responseTime,
      }, httpStatus);
    } catch (error) {
      return c.json({
        status: 'unhealthy',
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Health check failed',
        responseTime: Date.now() - startTime,
      }, 503);
    }
  });

  /**
   * 就绪状态检查
   * GET /health/ready
   */
  app.get('/ready', async (c: Context) => {
    try {
      // 注意：旧的load-balancer已被新的SmartLoadBalancer替代
      // const metricsCollector = getGlobalMetricsCollector();
      // const globalStats = metricsCollector.getGlobalStats();

      // 检查关键组件是否就绪
      const isReady = true; // 基本就绪检查

      if (isReady) {
        return c.json({
          status: 'ready',
          timestamp: Date.now(),
          message: 'Service is ready to accept requests',
        });
      } else {
        return c.json({
          status: 'not_ready',
          timestamp: Date.now(),
          message: 'Service is not ready',
        }, 503);
      }
    } catch (error) {
      return c.json({
        status: 'not_ready',
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Readiness check failed',
      }, 503);
    }
  });

  /**
   * 存活状态检查
   * GET /health/live
   */
  app.get('/live', async (c: Context) => {
    // 简单的存活检查 - 如果能响应这个请求，说明服务是活着的
    return c.json({
      status: 'alive',
      timestamp: Date.now(),
      message: 'Service is alive',
    });
  });

  /**
   * 详细统计信息
   * GET /health/stats
   */
  app.get('/stats', async (c: Context) => {
    try {
      const stats = await getDetailedStats();
      return c.json(stats);
    } catch (error) {
      return c.json({
        error: error instanceof Error ? error.message : 'Failed to get stats',
        timestamp: Date.now(),
      }, 500);
    }
  });

  /**
   * 负载均衡器状态
   * GET /health/load-balancer
   */
  app.get('/load-balancer', async (c: Context) => {
    try {
      // 注意：旧的load-balancer已被新的SmartLoadBalancer替代
      // const metricsCollector = getGlobalMetricsCollector();
      // const globalStats = metricsCollector.getGlobalStats();
      // const summary = metricsCollector.getPerformanceSummary();
      
      return c.json({
        timestamp: Date.now(),
        message: 'Load balancer stats temporarily unavailable - using new SmartLoadBalancer',
        // stats: globalStats,
        // performance: summary,
        // keyMetrics: Array.from(metricsCollector.getAllKeyMetrics().values()),
      });
    } catch (error) {
      return c.json({
        error: error instanceof Error ? error.message : 'Failed to get load balancer stats',
        timestamp: Date.now(),
      }, 500);
    }
  });

  return app;
}

/**
 * 执行健康检查
 */
async function performHealthChecks(): Promise<SystemHealth> {
  const startTime = Date.now();
  const checks = await Promise.allSettled([
    checkDatabase(),
    checkGeminiAPI(),
    checkLoadBalancer(),
    checkMemoryUsage(),
  ]);

  const [dbCheck, apiCheck, lbCheck, memCheck] = checks;
  
  const health: SystemHealth = {
    status: 'healthy',
    timestamp: Date.now(),
    version: '2.0.0',
    uptime: Date.now() - startTime, // 简化的uptime计算
    checks: {
      database: dbCheck.status === 'fulfilled' ? dbCheck.value : { status: 'down', error: 'Check failed' },
      gemini_api: apiCheck.status === 'fulfilled' ? apiCheck.value : { status: 'down', error: 'Check failed' },
      load_balancer: lbCheck.status === 'fulfilled' ? lbCheck.value : { status: 'down', totalKeys: 0, healthyKeys: 0, unhealthyKeys: 0 },
      memory: memCheck.status === 'fulfilled' ? memCheck.value : { status: 'critical' },
    },
  };

  // 确定整体健康状态
  const hasDown = Object.values(health.checks).some(check => 
    (check as any).status === 'down' || (check as any).status === 'critical'
  );
  
  const hasDegraded = Object.values(health.checks).some(check => 
    (check as any).status === 'degraded' || (check as any).status === 'high'
  );

  if (hasDown) {
    health.status = 'unhealthy';
  } else if (hasDegraded) {
    health.status = 'degraded';
  }

  return health;
}

/**
 * 检查数据库状态
 */
async function checkDatabase(): Promise<{ status: 'up' | 'down'; responseTime?: number; error?: string }> {
  const startTime = Date.now();
  
  try {
    // 尝试获取数据库管理器
    const { getGlobalDatabaseManager } = await import('../database/index.js');
    const dbManager = getGlobalDatabaseManager();
    
    if (!dbManager.isDatabaseInitialized()) {
      return {
        status: 'down',
        error: 'Database not initialized',
        responseTime: Date.now() - startTime,
      };
    }
    
    // 执行数据库健康检查
    const dbHealth = await dbManager.healthCheck();
    const responseTime = Date.now() - startTime;
    
    if (dbHealth.status === 'healthy') {
      return {
        status: 'up',
        responseTime,
      };
    } else {
      return {
        status: 'down',
        error: dbHealth.message,
        responseTime,
      };
    }
  } catch (error) {
    return {
      status: 'down',
      error: error instanceof Error ? error.message : 'Database check failed',
      responseTime: Date.now() - startTime,
    };
  }
}

/**
 * 检查Gemini API状态
 * 纯代理模式：只检查API基础连接性，不使用API Key
 */
async function checkGeminiAPI(): Promise<{ status: 'up' | 'down'; responseTime?: number; error?: string }> {
  const startTime = Date.now();
  
  try {
    // 只检查Gemini API基础URL的连通性，不调用需要认证的端点
    // 这里我们简单地检查DNS解析和基础连接
    const response = await fetch(`${API_CONFIG.GEMINI_BASE_URL}`, {
      method: 'HEAD', // 使用HEAD请求减少负载
      signal: AbortSignal.timeout(5000),
    });

    const responseTime = Date.now() - startTime;

    // 对于纯代理服务，只要能连接到Google的服务器就认为是健康的
    // 403/401等认证错误在这种情况下是预期的，不影响服务健康状态
    if (response.status < 500) {
      return {
        status: 'up',
        responseTime,
      };
    } else {
      return {
        status: 'down',
        error: `HTTP ${response.status}`,
        responseTime,
      };
    }
  } catch (error) {
    return {
      status: 'down',
      error: error instanceof Error ? error.message : 'Gemini API check failed',
      responseTime: Date.now() - startTime,
    };
  }
}

/**
 * 检查负载均衡器状态
 */
async function checkLoadBalancer(): Promise<{ status: 'up' | 'down'; totalKeys: number; healthyKeys: number; unhealthyKeys: number }> {
  try {
    // 注意：旧的load-balancer已被新的SmartLoadBalancer替代
    // const metricsCollector = getGlobalMetricsCollector();
    // const globalStats = metricsCollector.getGlobalStats();

    return {
      status: 'up',
      totalKeys: 0, // 临时值
      healthyKeys: 0, // 临时值
      unhealthyKeys: 0, // 临时值
    };
  } catch (error) {
    return {
      status: 'down',
      totalKeys: 0,
      healthyKeys: 0,
      unhealthyKeys: 0,
    };
  }
}

/**
 * 检查内存使用情况
 */
async function checkMemoryUsage(): Promise<{ status: 'ok' | 'high' | 'critical'; usage?: number }> {
  try {
    // 在Cloudflare Workers环境中，内存检查是有限的
    // 这里返回一个模拟的检查结果
    const usage = 0.3; // 30%使用率

    if (usage > 0.9) {
      return { status: 'critical', usage };
    } else if (usage > 0.7) {
      return { status: 'high', usage };
    } else {
      return { status: 'ok', usage };
    }
  } catch (error) {
    return { status: 'critical' };
  }
}

/**
 * 获取详细统计信息
 */
async function getDetailedStats(): Promise<DetailedStats> {
  // 注意：旧的load-balancer已被新的SmartLoadBalancer替代
  // const metricsCollector = getGlobalMetricsCollector();
  // const globalStats = metricsCollector.getGlobalStats();
  // const allMetrics = metricsCollector.getAllKeyMetrics();

  // 构建KEY性能统计
  const keyPerformance: any[] = []; // 临时空数组
  // 注意：旧的load-balancer已被新的SmartLoadBalancer替代
  // const keyPerformance = Array.from(allMetrics.values()).map(metrics => ({
  //   keyHash: metrics.keyHash,
  //   requests: metrics.totalRequests,
  //   successRate: metrics.totalRequests > 0 ? metrics.successfulRequests / metrics.totalRequests : 0,
  //   avgResponseTime: metrics.averageResponseTime,
  //   isHealthy: metrics.isHealthy,
  // }));

  const stats: DetailedStats = {
    system: {
      timestamp: Date.now(),
      uptime: Date.now(), // 简化的uptime
      version: '2.0.0',
    },
    requests: {
      total: 0, // 临时值
      successful: 0, // 临时值
      failed: 0, // 临时值
      averageResponseTime: 0, // 临时值
      last24Hours: {
        total: 0, // 临时值
        successful: 0, // 临时值
        failed: 0, // 临时值
      },
    },
    loadBalancer: {
      totalKeys: 0, // 临时值
      healthyKeys: 0, // 临时值
      unhealthyKeys: 0, // 临时值
      averageResponseTime: 0, // 临时值
      keyPerformance,
    },
    memory: {
      usage: 0.3, // 模拟值
      limit: 1.0,
      cacheSize: 0.1, // 模拟值
    },
  };

  return stats;
}