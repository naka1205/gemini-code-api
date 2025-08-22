/**
 * 负载均衡选择器
 * 纯代理模式 - 智能选择客户端提交的最优API KEY
 */
import type { LoadBalancerConfig, KeyPerformanceMetrics, LoadBalancerResult } from '@/types/services.js';
import { LOAD_BALANCER_CONFIG } from '@/utils/constants.js';
import { hashApiKey } from '@/utils/helpers.js';
import { log } from '@/utils/logger.js';
import { perf } from './performance.js';

/**
 * API密钥选择器
 */
export class ApiKeySelector {
  private config: LoadBalancerConfig;
  private keyMetrics = new Map<string, KeyPerformanceMetrics>(); // keyHash -> metrics

  constructor(config: Partial<LoadBalancerConfig> = {}) {
    this.config = {
      maxConsecutiveErrors: LOAD_BALANCER_CONFIG.MAX_CONSECUTIVE_ERRORS,
      performanceWindow: LOAD_BALANCER_CONFIG.PERFORMANCE_WINDOW,
      responseTimeWeight: LOAD_BALANCER_CONFIG.RESPONSE_TIME_WEIGHT,
      successRateWeight: LOAD_BALANCER_CONFIG.SUCCESS_RATE_WEIGHT,
      minRequestsForStats: LOAD_BALANCER_CONFIG.MIN_REQUESTS_FOR_STATS,
      unhealthyThreshold: LOAD_BALANCER_CONFIG.UNHEALTHY_THRESHOLD,
      recoveryCheckInterval: LOAD_BALANCER_CONFIG.RECOVERY_CHECK_INTERVAL,
      ...config,
    };
  }

  /**
   * 从客户端提交的多个API KEY中选择最优的一个
   */
  selectApiKey(apiKeys: string[]): LoadBalancerResult {
    return perf.time('key_selection', () => {
      if (!apiKeys || apiKeys.length === 0) {
        throw new Error('No API keys provided');
      }

      // 记录可用KEY数量
      perf.record('available_api_keys', apiKeys.length, 'count');

      // 如果只有一个KEY，直接返回
      if (apiKeys.length === 1) {
        const key = apiKeys[0];
        const keyHash = hashApiKey(key);
        const isHealthy = this.isKeyHealthy(keyHash);
        
        perf.record('healthy_api_keys', isHealthy ? 1 : 0, 'count');
        
        return {
          selectedKey: key,
          selectedKeyHash: keyHash,
          reason: 'single_key',
          availableKeys: 1,
          healthyKeys: isHealthy ? 1 : 0,
        };
      }

      // 获取所有健康的KEY
      const healthyKeys = apiKeys.filter(key => {
        const keyHash = hashApiKey(key);
        return this.isKeyHealthy(keyHash);
      });

      const availableKeys = apiKeys.length;
      const healthyKeyCount = healthyKeys.length;
      
      // 记录健康KEY数量
      perf.record('healthy_api_keys', healthyKeyCount, 'count');
      perf.record('key_health_ratio', healthyKeyCount / availableKeys, 'ratio');

      // 如果没有健康的KEY，选择最不差的一个
      if (healthyKeys.length === 0) {
        log.warn('No healthy API keys available, selecting least bad option', {
          totalKeys: availableKeys,
        });
        
        const leastBadKey = this.selectLeastBadKey(apiKeys);
        const keyHash = hashApiKey(leastBadKey);
        
        return {
          selectedKey: leastBadKey,
          selectedKeyHash: keyHash,
          reason: 'least_bad_fallback',
          availableKeys,
          healthyKeys: 0,
        };
      }

      // 从健康的KEY中选择性能最优的
      const bestKey = this.selectBestPerformingKey(healthyKeys);
      const keyHash = hashApiKey(bestKey);

      log.debug('API key selected', {
        reason: 'performance_optimized',
        availableKeys,
        healthyKeys: healthyKeyCount,
        selectedKeyHash: keyHash.substring(0, 8) + '...',
      });

      return {
        selectedKey: bestKey,
        selectedKeyHash: keyHash,
        reason: 'performance_optimized',
        availableKeys,
        healthyKeys: healthyKeyCount,
      };
    });
  }

  /**
   * 记录API KEY的性能指标
   */
  recordMetrics(apiKey: string, responseTime: number, success: boolean): void {
    const keyHash = hashApiKey(apiKey);
    const now = Date.now();

    // 记录性能监控指标
    perf.record('api_response_time', responseTime, 'ms', { 
      keyHash: keyHash.substring(0, 8),
      success: success.toString(),
    });
    perf.record('api_request_count', 1, 'count', { 
      keyHash: keyHash.substring(0, 8),
      success: success.toString(),
    });

    let metrics = this.keyMetrics.get(keyHash);
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
        lastUsed: now,
        firstSeen: now,
      };
      this.keyMetrics.set(keyHash, metrics);
      
      log.debug('New API key registered', {
        keyHash: keyHash.substring(0, 8) + '...',
        responseTime,
        success,
      });
    }

    // 更新统计数据
    metrics.totalRequests++;
    metrics.lastResponseTime = responseTime;
    metrics.lastUsed = now;

    if (success) {
      metrics.successfulRequests++;
      metrics.consecutiveFailures = 0;
    } else {
      metrics.failedRequests++;
      metrics.consecutiveFailures++;
      
      log.warn('API key request failed', {
        keyHash: keyHash.substring(0, 8) + '...',
        consecutiveFailures: metrics.consecutiveFailures,
        responseTime,
      });
    }

    // 更新平均响应时间（指数移动平均）
    const alpha = 0.1; // 平滑因子
    if (metrics.averageResponseTime === 0) {
      metrics.averageResponseTime = responseTime;
    } else {
      metrics.averageResponseTime = 
        metrics.averageResponseTime * (1 - alpha) + responseTime * alpha;
    }

    // 更新健康状态
    this.updateHealthStatus(keyHash);
    
    // 记录负载均衡器健康分数
    const healthScore = this.calculateLoadBalancerHealth();
    perf.record('load_balancer_health', healthScore, 'score');
  }

  /**
   * 获取API KEY的性能指标
   */
  getKeyMetrics(apiKey: string): KeyPerformanceMetrics | null {
    const keyHash = hashApiKey(apiKey);
    return this.keyMetrics.get(keyHash) || null;
  }

  /**
   * 获取所有KEY的性能指标
   */
  getAllMetrics(): Map<string, KeyPerformanceMetrics> {
    return new Map(this.keyMetrics);
  }

  /**
   * 清理过期的性能指标
   */
  cleanupMetrics(): number {
    const now = Date.now();
    const cutoffTime = now - (this.config.performanceWindow * 2); // 保留2倍窗口期的数据
    let cleanedCount = 0;

    for (const [keyHash, metrics] of this.keyMetrics.entries()) {
      if (metrics.lastUsed < cutoffTime) {
        this.keyMetrics.delete(keyHash);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * 重置指定KEY的连续失败计数（用于恢复检查）
   */
  resetConsecutiveFailures(apiKey: string): void {
    const keyHash = hashApiKey(apiKey);
    const metrics = this.keyMetrics.get(keyHash);
    
    if (metrics) {
      metrics.consecutiveFailures = 0;
      this.updateHealthStatus(keyHash);
    }
  }

  /**
   * 获取配置信息
   */
  getConfig(): LoadBalancerConfig {
    return { ...this.config };
  }

  // === 私有方法 ===

  private isKeyHealthy(keyHash: string): boolean {
    const metrics = this.keyMetrics.get(keyHash);
    
    if (!metrics) {
      return true; // 新KEY默认健康
    }

    return metrics.isHealthy;
  }

  private selectBestPerformingKey(apiKeys: string[]): string {
    let bestKey = apiKeys[0];
    let bestScore = 0;

    for (const key of apiKeys) {
      const score = this.calculateKeyScore(key);
      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }

    return bestKey;
  }

  private selectLeastBadKey(apiKeys: string[]): string {
    let leastBadKey = apiKeys[0];
    let bestScore = -Infinity;

    for (const key of apiKeys) {
      const score = this.calculateKeyScore(key);
      if (score > bestScore) {
        bestScore = score;
        leastBadKey = key;
      }
    }

    return leastBadKey;
  }

  private calculateKeyScore(apiKey: string): number {
    const keyHash = hashApiKey(apiKey);
    const metrics = this.keyMetrics.get(keyHash);

    if (!metrics || metrics.totalRequests < this.config.minRequestsForStats) {
      return 0.5; // 新KEY或数据不足的KEY给中等分数
    }

    // 计算成功率分数 (0-1)
    const successRate = metrics.successfulRequests / metrics.totalRequests;
    const successScore = Math.max(0, Math.min(1, successRate));

    // 计算响应时间分数 (0-1，响应时间越短分数越高)
    const avgResponseTime = metrics.averageResponseTime;
    const responseTimeScore = Math.max(0, Math.min(1, 1 - (avgResponseTime - 100) / 5000)); // 100ms基准，5000ms上限

    // 加权计算总分
    const totalScore = 
      successScore * this.config.successRateWeight +
      responseTimeScore * this.config.responseTimeWeight;

    // 连续失败惩罚
    const failurePenalty = Math.min(0.5, metrics.consecutiveFailures * 0.1);
    
    return Math.max(0, totalScore - failurePenalty);
  }

  private updateHealthStatus(keyHash: string): void {
    const metrics = this.keyMetrics.get(keyHash);
    if (!metrics) return;

    // 健康检查条件
    const hasEnoughData = metrics.totalRequests >= this.config.minRequestsForStats;
    const consecutiveFailuresTooHigh = metrics.consecutiveFailures >= this.config.maxConsecutiveErrors;
    const successRateTooLow = hasEnoughData && 
      (metrics.successfulRequests / metrics.totalRequests) < this.config.unhealthyThreshold;

    // 更新健康状态
    if (consecutiveFailuresTooHigh || successRateTooLow) {
      metrics.isHealthy = false;
    } else if (metrics.consecutiveFailures === 0 && hasEnoughData) {
      // 如果连续失败为0且有足够数据，标记为健康
      metrics.isHealthy = true;
    }
  }

  /**
   * 计算负载均衡器整体健康分数
   */
  private calculateLoadBalancerHealth(): number {
    if (this.keyMetrics.size === 0) {
      return 1.0; // 没有数据时假设健康
    }

    let totalScore = 0;
    let validKeys = 0;

    for (const metrics of this.keyMetrics.values()) {
      if (metrics.totalRequests >= this.config.minRequestsForStats) {
        const successRate = metrics.successfulRequests / metrics.totalRequests;
        const responseTimeScore = Math.max(0, Math.min(1, 1 - (metrics.averageResponseTime - 100) / 5000));
        const keyScore = (successRate + responseTimeScore) / 2;
        
        totalScore += keyScore;
        validKeys++;
      }
    }

    return validKeys > 0 ? totalScore / validKeys : 1.0;
  }
}

/**
 * 负载均衡器统计信息
 */
export interface LoadBalancerStats {
  totalKeys: number;
  healthyKeys: number;
  unhealthyKeys: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  lastCleanup: number;
}

/**
 * 全局负载均衡器选择器实例
 */
let globalSelector: ApiKeySelector | null = null;

export function getGlobalSelector(): ApiKeySelector {
  if (!globalSelector) {
    globalSelector = new ApiKeySelector();
  }
  return globalSelector;
}

/**
 * 创建自定义配置的选择器
 */
export function createSelector(config: Partial<LoadBalancerConfig>): ApiKeySelector {
  return new ApiKeySelector(config);
}