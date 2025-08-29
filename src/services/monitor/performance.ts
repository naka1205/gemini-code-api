import { log } from '../../utils/logger.js';

/**
 * 性能指标接口
 */
export interface PerformanceMetrics {
  timestamp: number;
  kvReads: number;
  kvWrites: number;
  kvErrors: number;
  dbQueries: number;
  dbSlowQueries: number;
  dbErrors: number;
  responseTime: number;
  memoryUsage: number;
  requestCount: number;
  errorCount: number;
}

/**
 * 告警级别
 */
export type AlertLevel = 'info' | 'warning' | 'error' | 'critical';

/**
 * 告警接口
 */
export interface Alert {
  id: string;
  level: AlertLevel;
  message: string;
  timestamp: number;
  metric: string;
  value: number;
  threshold: number;
  resolved: boolean;
  resolvedAt?: number;
}

/**
 * 性能监控器
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private alerts: Alert[] = [];
  private readonly MAX_METRICS_HISTORY = 1000;
  private readonly MAX_ALERTS_HISTORY = 100;

  // 告警阈值配置
  private readonly THRESHOLDS = {
    kvReadsPerMinute: 1000,
    kvWritesPerMinute: 100,
    kvErrorRate: 0.05, // 5%
    dbQueriesPerMinute: 500,
    dbSlowQueryRate: 0.1, // 10%
    dbErrorRate: 0.02, // 2%
    responseTimeMs: 5000,
    memoryUsagePercent: 80,
    errorRate: 0.05, // 5%
  };

  /**
   * 记录性能指标
   */
  recordMetrics(metrics: Partial<PerformanceMetrics>): void {
    const fullMetrics: PerformanceMetrics = {
      timestamp: Date.now(),
      kvReads: 0,
      kvWrites: 0,
      kvErrors: 0,
      dbQueries: 0,
      dbSlowQueries: 0,
      dbErrors: 0,
      responseTime: 0,
      memoryUsage: 0,
      requestCount: 0,
      errorCount: 0,
      ...metrics,
    };

    this.metrics.push(fullMetrics);

    // 限制历史记录大小
    if (this.metrics.length > this.MAX_METRICS_HISTORY) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS_HISTORY);
    }

    // 检查告警
    this.checkAlerts(fullMetrics);
  }

  /**
   * 记录KV操作
   */
  recordKVOperation(type: 'read' | 'write', success: boolean): void {
    const metrics: Partial<PerformanceMetrics> = {};
    
    if (type === 'read') {
      metrics.kvReads = 1;
    } else {
      metrics.kvWrites = 1;
    }
    
    if (!success) {
      metrics.kvErrors = 1;
    }
    
    this.recordMetrics(metrics);
  }

  /**
   * 记录数据库操作
   */
  recordDBOperation(success: boolean, isSlow: boolean = false): void {
    const metrics: Partial<PerformanceMetrics> = {
      dbQueries: 1,
    };
    
    if (!success) {
      metrics.dbErrors = 1;
    }
    
    if (isSlow) {
      metrics.dbSlowQueries = 1;
    }
    
    this.recordMetrics(metrics);
  }

  /**
   * 记录请求响应时间
   */
  recordResponseTime(responseTime: number): void {
    this.recordMetrics({
      responseTime,
      requestCount: 1,
    });
  }

  /**
   * 记录错误
   */
  recordError(): void {
    this.recordMetrics({
      errorCount: 1,
    });
  }

  /**
   * 检查告警
   */
  private checkAlerts(metrics: PerformanceMetrics): void {
    // 检查KV错误率
    const kvErrorRate = metrics.kvErrors / Math.max(metrics.kvReads + metrics.kvWrites, 1);
    if (kvErrorRate > this.THRESHOLDS.kvErrorRate) {
      this.createAlert('kv_error_rate', 'error', 
        `KV错误率过高: ${(kvErrorRate * 100).toFixed(2)}%`, 
        kvErrorRate, this.THRESHOLDS.kvErrorRate);
    }

    // 检查数据库慢查询率
    const dbSlowQueryRate = metrics.dbSlowQueries / Math.max(metrics.dbQueries, 1);
    if (dbSlowQueryRate > this.THRESHOLDS.dbSlowQueryRate) {
      this.createAlert('db_slow_query_rate', 'warning',
        `数据库慢查询率过高: ${(dbSlowQueryRate * 100).toFixed(2)}%`,
        dbSlowQueryRate, this.THRESHOLDS.dbSlowQueryRate);
    }

    // 检查数据库错误率
    const dbErrorRate = metrics.dbErrors / Math.max(metrics.dbQueries, 1);
    if (dbErrorRate > this.THRESHOLDS.dbErrorRate) {
      this.createAlert('db_error_rate', 'error',
        `数据库错误率过高: ${(dbErrorRate * 100).toFixed(2)}%`,
        dbErrorRate, this.THRESHOLDS.dbErrorRate);
    }

    // 检查响应时间
    if (metrics.responseTime > this.THRESHOLDS.responseTimeMs) {
      this.createAlert('response_time', 'warning',
        `响应时间过长: ${metrics.responseTime}ms`,
        metrics.responseTime, this.THRESHOLDS.responseTimeMs);
    }

    // 检查内存使用率
    if (metrics.memoryUsage > this.THRESHOLDS.memoryUsagePercent) {
      this.createAlert('memory_usage', 'warning',
        `内存使用率过高: ${metrics.memoryUsage}%`,
        metrics.memoryUsage, this.THRESHOLDS.memoryUsagePercent);
    }

    // 检查总体错误率
    const errorRate = metrics.errorCount / Math.max(metrics.requestCount, 1);
    if (errorRate > this.THRESHOLDS.errorRate) {
      this.createAlert('error_rate', 'error',
        `总体错误率过高: ${(errorRate * 100).toFixed(2)}%`,
        errorRate, this.THRESHOLDS.errorRate);
    }
  }

  /**
   * 创建告警
   */
  private createAlert(
    metric: string,
    level: AlertLevel,
    message: string,
    value: number,
    threshold: number
  ): void {
    const alert: Alert = {
      id: `${metric}_${Date.now()}`,
      level,
      message,
      timestamp: Date.now(),
      metric,
      value,
      threshold,
      resolved: false,
    };

    this.alerts.push(alert);

    // 限制告警历史记录大小
    if (this.alerts.length > this.MAX_ALERTS_HISTORY) {
      this.alerts = this.alerts.slice(-this.MAX_ALERTS_HISTORY);
    }

    // 记录告警日志
    log.warn('Performance alert created', {
      alert: {
        level,
        message,
        metric,
        value,
        threshold,
      },
    });
  }

  /**
   * 获取最近的性能指标
   */
  getRecentMetrics(minutes: number = 5): PerformanceMetrics[] {
    const cutoffTime = Date.now() - (minutes * 60 * 1000);
    return this.metrics.filter(m => m.timestamp >= cutoffTime);
  }

  /**
   * 获取聚合性能指标
   */
  getAggregatedMetrics(minutes: number = 5): PerformanceMetrics {
    const recentMetrics = this.getRecentMetrics(minutes);
    
    if (recentMetrics.length === 0) {
      return {
        timestamp: Date.now(),
        kvReads: 0,
        kvWrites: 0,
        kvErrors: 0,
        dbQueries: 0,
        dbSlowQueries: 0,
        dbErrors: 0,
        responseTime: 0,
        memoryUsage: 0,
        requestCount: 0,
        errorCount: 0,
      };
    }

    const aggregated: PerformanceMetrics = {
      timestamp: Date.now(),
      kvReads: recentMetrics.reduce((sum, m) => sum + m.kvReads, 0),
      kvWrites: recentMetrics.reduce((sum, m) => sum + m.kvWrites, 0),
      kvErrors: recentMetrics.reduce((sum, m) => sum + m.kvErrors, 0),
      dbQueries: recentMetrics.reduce((sum, m) => sum + m.dbQueries, 0),
      dbSlowQueries: recentMetrics.reduce((sum, m) => sum + m.dbSlowQueries, 0),
      dbErrors: recentMetrics.reduce((sum, m) => sum + m.dbErrors, 0),
      responseTime: recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length,
      memoryUsage: recentMetrics.reduce((sum, m) => sum + m.memoryUsage, 0) / recentMetrics.length,
      requestCount: recentMetrics.reduce((sum, m) => sum + m.requestCount, 0),
      errorCount: recentMetrics.reduce((sum, m) => sum + m.errorCount, 0),
    };

    return aggregated;
  }

  /**
   * 获取活跃告警
   */
  getActiveAlerts(): Alert[] {
    return this.alerts.filter(alert => !alert.resolved);
  }

  /**
   * 解决告警
   */
  resolveAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();
      
      log.info('Performance alert resolved', {
        alertId,
        message: alert.message,
      });
    }
  }

  /**
   * 获取性能统计
   */
  getPerformanceStats(): {
    totalRequests: number;
    totalErrors: number;
    averageResponseTime: number;
    p50ResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    kvOperations: number;
    dbOperations: number;
    activeAlerts: number;
  } {
    const recentMetrics = this.getRecentMetrics(5);
    const activeAlerts = this.getActiveAlerts();
    const latencies = recentMetrics.map(m => m.responseTime).filter(v => typeof v === 'number' && v > 0);
    const { p50, p95, p99 } = computePercentiles(latencies);

    return {
      totalRequests: recentMetrics.reduce((sum, m) => sum + m.requestCount, 0),
      totalErrors: recentMetrics.reduce((sum, m) => sum + m.errorCount, 0),
      averageResponseTime: recentMetrics.length > 0 
        ? recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length 
        : 0,
      p50ResponseTime: p50,
      p95ResponseTime: p95,
      p99ResponseTime: p99,
      kvOperations: recentMetrics.reduce((sum, m) => sum + m.kvReads + m.kvWrites, 0),
      dbOperations: recentMetrics.reduce((sum, m) => sum + m.dbQueries, 0),
      activeAlerts: activeAlerts.length,
    };
  }

  /**
   * 健康检查
   */
  healthCheck(): { status: 'healthy' | 'degraded' | 'unhealthy'; issues: string[] } {
    const activeAlerts = this.getActiveAlerts();
    const criticalAlerts = activeAlerts.filter(a => a.level === 'critical');
    const errorAlerts = activeAlerts.filter(a => a.level === 'error');
    const warningAlerts = activeAlerts.filter(a => a.level === 'warning');

    const issues: string[] = [];

    if (criticalAlerts.length > 0) {
      issues.push(`${criticalAlerts.length} 个严重告警`);
    }

    if (errorAlerts.length > 0) {
      issues.push(`${errorAlerts.length} 个错误告警`);
    }

    if (warningAlerts.length > 0) {
      issues.push(`${warningAlerts.length} 个警告告警`);
    }

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (criticalAlerts.length > 0 || errorAlerts.length > 3) {
      status = 'unhealthy';
    } else if (errorAlerts.length > 0 || warningAlerts.length > 5) {
      status = 'degraded';
    }

    return { status, issues };
  }
}

// 全局性能监控器实例
let globalPerformanceMonitor: PerformanceMonitor | null = null;

/**
 * 获取全局性能监控器
 */
export function getGlobalPerformanceMonitor(): PerformanceMonitor {
  if (!globalPerformanceMonitor) {
    globalPerformanceMonitor = new PerformanceMonitor();
  }
  return globalPerformanceMonitor;
}

// === 工具函数：计算百分位 ===
function computePercentiles(values: number[]): { p50: number; p95: number; p99: number } {
  if (!values || values.length === 0) {
    return { p50: 0, p95: 0, p99: 0 };
  }
  const arr = [...values].sort((a, b) => a - b);
  const get = (p: number) => {
    const idx = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, Math.min(arr.length - 1, idx))];
  };
  return { p50: get(50), p95: get(95), p99: get(99) };
}
