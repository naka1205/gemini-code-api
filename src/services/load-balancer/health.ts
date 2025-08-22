/**
 * 负载均衡健康检查
 * 纯代理模式 - 监控客户端提交KEY的健康状态
 */
import type { KeyPerformanceMetrics, HealthCheckResult } from '@/types/services.js';
import { LOAD_BALANCER_CONFIG, API_CONFIG } from '@/utils/constants.js';
import { hashApiKey } from '@/utils/helpers.js';

/**
 * API KEY健康检查器
 */
export class HealthChecker {
  private lastHealthCheck = new Map<string, number>();

  /**
   * 检查API KEY是否健康
   */
  isKeyHealthy(_apiKey: string, metrics: KeyPerformanceMetrics): boolean {
    // 新KEY默认健康
    if (metrics.totalRequests < LOAD_BALANCER_CONFIG.MIN_REQUESTS_FOR_STATS) {
      return true;
    }

    // 连续失败次数检查
    if (metrics.consecutiveFailures >= LOAD_BALANCER_CONFIG.MAX_CONSECUTIVE_ERRORS) {
      return false;
    }

    // 成功率检查
    const successRate = metrics.successfulRequests / metrics.totalRequests;
    if (successRate < LOAD_BALANCER_CONFIG.UNHEALTHY_THRESHOLD) {
      return false;
    }

    return true;
  }

  /**
   * 执行健康检查
   */
  async performHealthCheck(apiKey: string): Promise<HealthCheckResult> {
    const keyHash = hashApiKey(apiKey);
    const now = Date.now();
    
    // 检查是否需要执行健康检查
    const lastCheck = this.lastHealthCheck.get(keyHash) || 0;
    if (now - lastCheck < LOAD_BALANCER_CONFIG.RECOVERY_CHECK_INTERVAL) {
      return {
        keyHash,
        isHealthy: false,
        lastChecked: lastCheck,
        reason: 'too_soon_to_recheck',
      };
    }

    try {
      // 执行简单的健康检查请求
      const startTime = Date.now();
      const response = await this.executeHealthCheckRequest(apiKey);
      const responseTime = Date.now() - startTime;

      this.lastHealthCheck.set(keyHash, now);

      return {
        keyHash,
        isHealthy: response.ok,
        lastChecked: now,
        responseTime,
        reason: response.ok ? 'health_check_passed' : 'health_check_failed',
        statusCode: response.status,
      };
    } catch (error) {
      this.lastHealthCheck.set(keyHash, now);
      
      return {
        keyHash,
        isHealthy: false,
        lastChecked: now,
        reason: 'health_check_error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 批量健康检查
   */
  async batchHealthCheck(apiKeys: string[]): Promise<HealthCheckResult[]> {
    const promises = apiKeys.map(key => this.performHealthCheck(key));
    return Promise.all(promises);
  }

  /**
   * 清理健康检查历史
   */
  cleanupHealthCheckHistory(): number {
    const now = Date.now();
    const cutoffTime = now - (LOAD_BALANCER_CONFIG.RECOVERY_CHECK_INTERVAL * 10); // 保留10倍检查间隔的历史
    let cleanedCount = 0;

    for (const [keyHash, lastCheck] of this.lastHealthCheck.entries()) {
      if (lastCheck < cutoffTime) {
        this.lastHealthCheck.delete(keyHash);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  // === 私有方法 ===

  private async executeHealthCheckRequest(apiKey: string): Promise<Response> {
    // 使用Gemini models API作为健康检查端点
    const url = `${API_CONFIG.GEMINI_BASE_URL}/v1beta/models?key=${apiKey}`;
    
    return fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'gemini-code-api/2.0.0',
      },
      signal: AbortSignal.timeout(5000), // 5秒超时
    });
  }
}

/**
 * 全局健康检查器实例
 */
let globalHealthChecker: HealthChecker | null = null;

export function getGlobalHealthChecker(): HealthChecker {
  if (!globalHealthChecker) {
    globalHealthChecker = new HealthChecker();
  }
  return globalHealthChecker;
}