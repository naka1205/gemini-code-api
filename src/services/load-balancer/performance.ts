/**
 * 性能监控指标系统
 * 收集、分析和报告系统性能数据
 */
import { log } from '../../utils/logger.js';

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface SystemMetrics {
  // 请求指标
  requestCount: number;
  averageResponseTime: number;
  errorRate: number;
  throughput: number; // 请求/秒

  // 负载均衡指标
  activeApiKeys: number;
  keySelectionTime: number;
  loadBalancerHealthScore: number;

  // 缓存指标
  cacheHitRate: number;
  cacheMemoryUsage: number;
  cacheSize: number;

  // 内存指标
  totalMemoryUsage: number;
  memoryPressure: number;
  garbageCollectionCount: number;

  // 网络指标
  activeConnections: number;
  networkLatency: number;
  bandwidthUsage: number;
}

export interface PerformanceAlert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  metric: string;
  threshold: number;
  currentValue: number;
  message: string;
  timestamp: number;
  resolved: boolean;
}

/**
 * 性能监控器
 */
export class PerformanceMonitor {
  private metrics = new Map<string, PerformanceMetric[]>();
  private alerts: PerformanceAlert[] = [];
  private collectionInterval: NodeJS.Timeout | null = null;
  private maxMetricHistory = 1000; // 保留最近1000个数据点
  private collectionIntervalMs = 10000; // 10秒收集一次

  // 阈值配置
  private thresholds = {
    responseTime: 5000, // 5秒
    errorRate: 0.05, // 5%
    memoryUsage: 0.9, // 90%
    cacheHitRate: 0.7, // 70%
    throughput: 10, // 最低10 req/s
  };

  constructor() {
    this.startCollection();
  }

  /**
   * 记录性能指标
   */
  recordMetric(name: string, value: number, unit: string = '', tags?: Record<string, string>): void {
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: Date.now(),
      ...(tags && { tags }),
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metricHistory = this.metrics.get(name)!;
    metricHistory.push(metric);

    // 保持历史记录在限制内
    if (metricHistory.length > this.maxMetricHistory) {
      metricHistory.shift();
    }

    // 检查阈值并生成告警
    this.checkThresholds(metric);
  }

  /**
   * 获取系统指标概览
   */
  getSystemMetrics(): SystemMetrics {
    const timeWindow = 60000; // 1分钟窗口

    return {
      requestCount: this.getMetricSum('request_count', timeWindow),
      averageResponseTime: this.getMetricAverage('response_time', timeWindow),
      errorRate: this.getMetricAverage('error_rate', timeWindow),
      throughput: this.getMetricRate('request_count', timeWindow),
      
      activeApiKeys: this.getLatestMetricValue('active_api_keys') || 0,
      keySelectionTime: this.getMetricAverage('key_selection_time', timeWindow),
      loadBalancerHealthScore: this.getLatestMetricValue('load_balancer_health') || 1.0,
      
      cacheHitRate: this.getMetricAverage('cache_hit_rate', timeWindow),
      cacheMemoryUsage: this.getLatestMetricValue('cache_memory_usage') || 0,
      cacheSize: this.getLatestMetricValue('cache_size') || 0,
      
      totalMemoryUsage: this.getLatestMetricValue('memory_usage') || 0,
      memoryPressure: this.getLatestMetricValue('memory_pressure') || 0,
      garbageCollectionCount: this.getMetricSum('gc_count', timeWindow),
      
      activeConnections: this.getLatestMetricValue('active_connections') || 0,
      networkLatency: this.getMetricAverage('network_latency', timeWindow),
      bandwidthUsage: this.getLatestMetricValue('bandwidth_usage') || 0,
    };
  }

  /**
   * 获取活跃告警
   */
  getActiveAlerts(): PerformanceAlert[] {
    return this.alerts.filter(alert => !alert.resolved);
  }

  /**
   * 解决告警
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      log.info(`Performance alert resolved: ${alert.message}`);
      return true;
    }
    return false;
  }

  /**
   * 获取性能趋势分析
   */
  getTrendAnalysis(metricName: string, timeWindow: number = 300000): {
    trend: 'up' | 'down' | 'stable';
    changePercent: number;
    confidence: number;
  } {
    const metrics = this.getMetricsInWindow(metricName, timeWindow);
    if (metrics.length < 2) {
      return { trend: 'stable', changePercent: 0, confidence: 0 };
    }

    // 计算趋势
    const firstHalf = metrics.slice(0, Math.floor(metrics.length / 2));
    const secondHalf = metrics.slice(Math.floor(metrics.length / 2));

    const firstAvg = firstHalf.reduce((sum, m) => sum + m.value, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, m) => sum + m.value, 0) / secondHalf.length;

    const changePercent = ((secondAvg - firstAvg) / firstAvg) * 100;
    const confidence = Math.min(1, metrics.length / 10); // 更多数据点 = 更高置信度

    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (Math.abs(changePercent) > 5) { // 5%变化阈值
      trend = changePercent > 0 ? 'up' : 'down';
    }

    return { trend, changePercent, confidence };
  }

  /**
   * 生成性能报告
   */
  generatePerformanceReport(): {
    summary: SystemMetrics;
    alerts: PerformanceAlert[];
    trends: Record<string, any>;
    recommendations: string[];
  } {
    const summary = this.getSystemMetrics();
    const alerts = this.getActiveAlerts();
    const recommendations: string[] = [];

    // 基于指标生成建议
    if (summary.errorRate > 0.05) {
      recommendations.push('Error rate is high. Check API key health and retry logic.');
    }

    if (summary.cacheHitRate < 0.7) {
      recommendations.push('Cache hit rate is low. Consider adjusting TTL settings.');
    }

    if (summary.memoryPressure > 0.8) {
      recommendations.push('Memory pressure is high. Consider reducing cache size or enabling aggressive cleanup.');
    }

    if (summary.averageResponseTime > 3000) {
      recommendations.push('Response time is slow. Check network latency and API performance.');
    }

    // 趋势分析
    const trends = {
      responseTime: this.getTrendAnalysis('response_time'),
      throughput: this.getTrendAnalysis('request_count'),
      errorRate: this.getTrendAnalysis('error_rate'),
      memoryUsage: this.getTrendAnalysis('memory_usage'),
    };

    return {
      summary,
      alerts,
      trends,
      recommendations,
    };
  }

  /**
   * 启动指标收集
   */
  private startCollection(): void {
    this.collectionInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, this.collectionIntervalMs);

    log.info('Performance monitoring started', {
      interval: this.collectionIntervalMs,
      maxHistory: this.maxMetricHistory,
    });
  }

  /**
   * 停止指标收集
   */
  stopCollection(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }
    
    log.info('Performance monitoring stopped');
  }

  /**
   * 收集系统指标
   */
  private collectSystemMetrics(): void {
    try {
      // 收集内存使用情况
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const memUsage = process.memoryUsage();
        this.recordMetric('memory_usage', memUsage.heapUsed, 'bytes');
        this.recordMetric('memory_total', memUsage.heapTotal, 'bytes');
        this.recordMetric('memory_external', memUsage.external, 'bytes');
      }

      // 记录时间戳
      this.recordMetric('collection_timestamp', Date.now(), 'ms');

    } catch (error) {
      log.error('Error collecting system metrics:', error as Error);
    }
  }

  /**
   * 检查阈值并生成告警
   */
  private checkThresholds(metric: PerformanceMetric): void {
    let threshold: number | undefined;
    let severity: PerformanceAlert['severity'] = 'medium';

    switch (metric.name) {
      case 'response_time':
        threshold = this.thresholds.responseTime;
        severity = metric.value > threshold * 2 ? 'critical' : 'high';
        break;
      case 'error_rate':
        threshold = this.thresholds.errorRate;
        severity = metric.value > threshold * 2 ? 'critical' : 'high';
        break;
      case 'memory_pressure':
        threshold = this.thresholds.memoryUsage;
        severity = metric.value > 0.95 ? 'critical' : 'high';
        break;
      case 'cache_hit_rate':
        threshold = this.thresholds.cacheHitRate;
        severity = metric.value < threshold * 0.5 ? 'high' : 'medium';
        break;
    }

    if (threshold !== undefined && 
        ((metric.name === 'cache_hit_rate' && metric.value < threshold) ||
         (metric.name !== 'cache_hit_rate' && metric.value > threshold))) {
      
      this.createAlert(metric, threshold, severity);
    }
  }

  /**
   * 创建告警
   */
  private createAlert(metric: PerformanceMetric, threshold: number, severity: PerformanceAlert['severity']): void {
    const alertId = `${metric.name}_${Date.now()}`;
    
    const alert: PerformanceAlert = {
      id: alertId,
      severity,
      metric: metric.name,
      threshold,
      currentValue: metric.value,
      message: `${metric.name} is ${metric.value}${metric.unit}, exceeds threshold of ${threshold}${metric.unit}`,
      timestamp: metric.timestamp,
      resolved: false,
    };

    this.alerts.push(alert);
    
    // 保持告警历史在合理范围内
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-50); // 保留最新50个
    }

    log.warn(`Performance alert created: ${alert.message}`, {
      alertId,
      severity,
      metric: metric.name,
      value: metric.value,
      threshold,
    });
  }

  // 辅助方法
  private getMetricsInWindow(name: string, timeWindow: number): PerformanceMetric[] {
    const metrics = this.metrics.get(name) || [];
    const cutoff = Date.now() - timeWindow;
    return metrics.filter(m => m.timestamp > cutoff);
  }

  private getMetricSum(name: string, timeWindow: number): number {
    const metrics = this.getMetricsInWindow(name, timeWindow);
    return metrics.reduce((sum, m) => sum + m.value, 0);
  }

  private getMetricAverage(name: string, timeWindow: number): number {
    const metrics = this.getMetricsInWindow(name, timeWindow);
    if (metrics.length === 0) return 0;
    return metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
  }

  private getMetricRate(name: string, timeWindow: number): number {
    const metrics = this.getMetricsInWindow(name, timeWindow);
    if (metrics.length < 2) return 0;
    
    const timeSpan = timeWindow / 1000; // 转换为秒
    const totalCount = this.getMetricSum(name, timeWindow);
    return totalCount / timeSpan;
  }

  private getLatestMetricValue(name: string): number | null {
    const metrics = this.metrics.get(name);
    if (!metrics || metrics.length === 0) return null;
    return metrics[metrics.length - 1].value;
  }

  /**
   * 销毁监控器
   */
  destroy(): void {
    this.stopCollection();
    this.metrics.clear();
    this.alerts = [];
    
    log.info('Performance monitor destroyed');
  }
}

/**
 * 全局性能监控器实例
 */
let globalPerformanceMonitor: PerformanceMonitor | null = null;

export function getGlobalPerformanceMonitor(): PerformanceMonitor {
  if (!globalPerformanceMonitor) {
    globalPerformanceMonitor = new PerformanceMonitor();
  }
  return globalPerformanceMonitor;
}

export function createPerformanceMonitor(): PerformanceMonitor {
  return new PerformanceMonitor();
}

/**
 * 便捷的性能记录函数
 */
export const perf = {
  record: (name: string, value: number, unit?: string, tags?: Record<string, string>) =>
    getGlobalPerformanceMonitor().recordMetric(name, value, unit, tags),
  
  time: <T>(name: string, fn: () => T): T => {
    const start = Date.now();
    try {
      const result = fn();
      const duration = Date.now() - start;
      getGlobalPerformanceMonitor().recordMetric(name, duration, 'ms');
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      getGlobalPerformanceMonitor().recordMetric(name, duration, 'ms', { error: 'true' });
      throw error;
    }
  },

  timeAsync: async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      getGlobalPerformanceMonitor().recordMetric(name, duration, 'ms');
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      getGlobalPerformanceMonitor().recordMetric(name, duration, 'ms', { error: 'true' });
      throw error;
    }
  },
};