/**
 * 负载均衡性能指标收集
 * 纯代理模式 - 仅内存统计，不持久化敏感信息
 */
import type { KeyPerformanceMetrics, LoadBalancerStats } from '@/types/services.js';
import { LOAD_BALANCER_CONFIG } from '@/utils/constants.js';
import { hashApiKey } from '@/utils/helpers.js';

/**
 * 性能指标收集器
 */
export class MetricsCollector {
  private metrics = new Map<string, KeyPerformanceMetrics>();
  private globalStats: LoadBalancerStats;

  constructor() {
    this.globalStats = {
      totalKeys: 0,
      healthyKeys: 0,
      unhealthyKeys: 0,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastCleanup: Date.now(),
    };
  }

  /**
   * 记录请求指标
   */
  recordRequest(
    apiKey: string,
    responseTime: number,
    success: boolean,
    _statusCode?: number // 使用下划线前缀表示未使用的参数
  ): void {
    const keyHash = hashApiKey(apiKey);
    const now = Date.now();

    // 更新KEY级别指标
    this.updateKeyMetrics(keyHash, responseTime, success, now);

    // 更新全局统计
    this.updateGlobalStats(responseTime, success);
  }

  /**
   * 获取KEY的性能指标
   */
  getKeyMetrics(apiKey: string): KeyPerformanceMetrics | null {
    const keyHash = hashApiKey(apiKey);
    return this.metrics.get(keyHash) || null;
  }

  /**
   * 获取所有KEY的指标
   */
  getAllKeyMetrics(): Map<string, KeyPerformanceMetrics> {
    return new Map(this.metrics);
  }

  /**
   * 获取全局统计
   */
  getGlobalStats(): LoadBalancerStats {
    this.refreshGlobalStats();
    return { ...this.globalStats };
  }

  /**
   * 获取健康KEY列表
   */
  getHealthyKeys(): string[] {
    const healthyKeys: string[] = [];
    
    for (const metrics of this.metrics.values()) {
      if (metrics.isHealthy) {
        healthyKeys.push(metrics.keyHash);
      }
    }

    return healthyKeys;
  }

  /**
   * 获取不健康KEY列表
   */
  getUnhealthyKeys(): string[] {
    const unhealthyKeys: string[] = [];
    
    for (const metrics of this.metrics.values()) {
      if (!metrics.isHealthy) {
        unhealthyKeys.push(metrics.keyHash);
      }
    }

    return unhealthyKeys;
  }

  /**
   * 获取KEY的性能分数
   */
  getKeyScore(apiKey: string): number {
    const keyHash = hashApiKey(apiKey);
    const metrics = this.metrics.get(keyHash);

    if (!metrics || metrics.totalRequests < LOAD_BALANCER_CONFIG.MIN_REQUESTS_FOR_STATS) {
      return 0.5; // 新KEY默认中等分数
    }

    // 成功率分数
    const successRate = metrics.successfulRequests / metrics.totalRequests;
    const successScore = Math.max(0, Math.min(1, successRate));

    // 响应时间分数
    const avgResponseTime = metrics.averageResponseTime;
    const responseTimeScore = Math.max(0, Math.min(1, 1 - (avgResponseTime - 100) / 5000));

    // 加权计算
    const totalScore = 
      successScore * LOAD_BALANCER_CONFIG.SUCCESS_RATE_WEIGHT +
      responseTimeScore * LOAD_BALANCER_CONFIG.RESPONSE_TIME_WEIGHT;

    // 连续失败惩罚
    const failurePenalty = Math.min(0.5, metrics.consecutiveFailures * 0.1);
    
    return Math.max(0, totalScore - failurePenalty);
  }

  /**
   * 清理过期指标
   */
  cleanupExpiredMetrics(): number {
    const now = Date.now();
    const cutoffTime = now - (LOAD_BALANCER_CONFIG.PERFORMANCE_WINDOW * 2);
    let cleanedCount = 0;

    for (const [keyHash, metrics] of this.metrics.entries()) {
      if (metrics.lastUsed < cutoffTime) {
        this.metrics.delete(keyHash);
        cleanedCount++;
      }
    }

    this.globalStats.lastCleanup = now;
    return cleanedCount;
  }

  /**
   * 重置KEY的连续失败计数
   */
  resetConsecutiveFailures(apiKey: string): void {
    const keyHash = hashApiKey(apiKey);
    const metrics = this.metrics.get(keyHash);
    
    if (metrics) {
      metrics.consecutiveFailures = 0;
      this.updateHealthStatus(metrics);
    }
  }

  /**
   * 获取性能摘要
   */
  getPerformanceSummary(): {
    bestKey?: string | undefined;
    worstKey?: string | undefined;
    averageScore: number;
    healthyKeyRatio: number;
  } {
    const allMetrics = Array.from(this.metrics.values());
    
    if (allMetrics.length === 0) {
      return {
        averageScore: 0,
        healthyKeyRatio: 0,
      };
    }

    let bestScore = -1;
    let worstScore = 2;
    let bestKey: string | undefined;
    let worstKey: string | undefined;
    let totalScore = 0;
    let healthyCount = 0;

    for (const metrics of allMetrics) {
      const score = this.calculateScore(metrics);
      totalScore += score;

      if (metrics.isHealthy) {
        healthyCount++;
      }

      if (score > bestScore) {
        bestScore = score;
        bestKey = metrics.keyHash;
      }

      if (score < worstScore) {
        worstScore = score;
        worstKey = metrics.keyHash;
      }
    }

    const result: {
      bestKey?: string | undefined;
      worstKey?: string | undefined;
      averageScore: number;
      healthyKeyRatio: number;
    } = {
      averageScore: totalScore / allMetrics.length,
      healthyKeyRatio: healthyCount / allMetrics.length,
    };

    if (bestKey !== undefined) {
      result.bestKey = bestKey;
    }
    
    if (worstKey !== undefined) {
      result.worstKey = worstKey;
    }

    return result;
  }

  // === 私有方法 ===

  private updateKeyMetrics(
    keyHash: string,
    responseTime: number,
    success: boolean,
    timestamp: number
  ): void {
    let metrics = this.metrics.get(keyHash);
    
    if (!metrics) {
      metrics = {
        keyHash,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        lastResponseTime: responseTime,
        consecutiveFailures: 0,
        isHealthy: true,
        lastUsed: timestamp,
        firstSeen: timestamp,
      };
      this.metrics.set(keyHash, metrics);
    }

    // 更新统计
    metrics.totalRequests++;
    metrics.lastResponseTime = responseTime;
    metrics.lastUsed = timestamp;

    if (success) {
      metrics.successfulRequests++;
      metrics.consecutiveFailures = 0;
    } else {
      metrics.failedRequests++;
      metrics.consecutiveFailures++;
    }

    // 更新平均响应时间（指数移动平均）
    const alpha = 0.1;
    if (metrics.averageResponseTime === 0) {
      metrics.averageResponseTime = responseTime;
    } else {
      metrics.averageResponseTime = 
        metrics.averageResponseTime * (1 - alpha) + responseTime * alpha;
    }

    // 更新健康状态
    this.updateHealthStatus(metrics);
  }

  private updateGlobalStats(responseTime: number, success: boolean): void {
    this.globalStats.totalRequests++;
    
    if (success) {
      this.globalStats.successfulRequests++;
    } else {
      this.globalStats.failedRequests++;
    }

    // 更新平均响应时间
    const alpha = 0.05; // 更小的平滑因子用于全局统计
    if (this.globalStats.averageResponseTime === 0) {
      this.globalStats.averageResponseTime = responseTime;
    } else {
      this.globalStats.averageResponseTime = 
        this.globalStats.averageResponseTime * (1 - alpha) + responseTime * alpha;
    }
  }

  private refreshGlobalStats(): void {
    const allMetrics = Array.from(this.metrics.values());
    
    this.globalStats.totalKeys = allMetrics.length;
    this.globalStats.healthyKeys = allMetrics.filter(m => m.isHealthy).length;
    this.globalStats.unhealthyKeys = allMetrics.filter(m => !m.isHealthy).length;
  }

  private updateHealthStatus(metrics: KeyPerformanceMetrics): void {
    const hasEnoughData = metrics.totalRequests >= LOAD_BALANCER_CONFIG.MIN_REQUESTS_FOR_STATS;
    const consecutiveFailuresTooHigh = metrics.consecutiveFailures >= LOAD_BALANCER_CONFIG.MAX_CONSECUTIVE_ERRORS;
    const successRateTooLow = hasEnoughData && 
      (metrics.successfulRequests / metrics.totalRequests) < LOAD_BALANCER_CONFIG.UNHEALTHY_THRESHOLD;

    if (consecutiveFailuresTooHigh || successRateTooLow) {
      metrics.isHealthy = false;
    } else if (metrics.consecutiveFailures === 0 && hasEnoughData) {
      metrics.isHealthy = true;
    }
  }

  private calculateScore(metrics: KeyPerformanceMetrics): number {
    if (metrics.totalRequests < LOAD_BALANCER_CONFIG.MIN_REQUESTS_FOR_STATS) {
      return 0.5;
    }

    const successRate = metrics.successfulRequests / metrics.totalRequests;
    const successScore = Math.max(0, Math.min(1, successRate));

    const avgResponseTime = metrics.averageResponseTime;
    const responseTimeScore = Math.max(0, Math.min(1, 1 - (avgResponseTime - 100) / 5000));

    const totalScore = 
      successScore * LOAD_BALANCER_CONFIG.SUCCESS_RATE_WEIGHT +
      responseTimeScore * LOAD_BALANCER_CONFIG.RESPONSE_TIME_WEIGHT;

    const failurePenalty = Math.min(0.5, metrics.consecutiveFailures * 0.1);
    
    return Math.max(0, totalScore - failurePenalty);
  }
}

/**
 * 全局指标收集器实例
 */
let globalMetricsCollector: MetricsCollector | null = null;

export function getGlobalMetricsCollector(): MetricsCollector {
  if (!globalMetricsCollector) {
    globalMetricsCollector = new MetricsCollector();
  }
  return globalMetricsCollector;
}