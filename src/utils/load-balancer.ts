// src/utils/load-balancer.ts

export interface ApiKeyMetrics {
  key: string;
  successCount: number;
  errorCount: number;
  avgResponseTime: number;
  lastUsed: number;
  consecutiveErrors: number;
  isHealthy: boolean;
  totalRequests: number;
  lastHealthCheck: number;
  markedUnhealthyAt?: number;
}

export interface LoadBalancerConfig {
  maxConsecutiveErrors?: number;
  healthCheckInterval?: number;
  responseTimeWeight?: number;
  successRateWeight?: number;
  usageFrequencyWeight?: number;
  minResponseTime?: number;
  maxResponseTime?: number;
}

export class IntelligentLoadBalancer {
  private keyMetrics = new Map<string, ApiKeyMetrics>();
  private config: Required<LoadBalancerConfig>;
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(
    private keys: string[],
    config: LoadBalancerConfig = {}
  ) {
    this.config = {
      maxConsecutiveErrors: 3,
      healthCheckInterval: 60000, // 1 minute
      responseTimeWeight: 0.3,
      successRateWeight: 0.5,
      usageFrequencyWeight: 0.2,
      minResponseTime: 100,
      maxResponseTime: 30000,
      ...config
    };

    this.initializeMetrics();
    this.startHealthCheckTimer();
  }

  /**
   * Initialize metrics for all API keys
   */
  private initializeMetrics(): void {
    this.keys.forEach(key => {
      this.keyMetrics.set(key, {
        key,
        successCount: 0,
        errorCount: 0,
        avgResponseTime: 1000, // Default 1s
        lastUsed: 0,
        consecutiveErrors: 0,
        isHealthy: true,
        totalRequests: 0,
        lastHealthCheck: Date.now(),
        markedUnhealthyAt: undefined
      });
    });
  }

  /**
   * Select the best API key using weighted round-robin algorithm
   */
  selectApiKey(): string {
    const healthyKeys = Array.from(this.keyMetrics.values())
      .filter(metrics => metrics.isHealthy);

    if (healthyKeys.length === 0) {
      // If no healthy keys, reset all and try again
      this.resetAllKeys();
      return this.keys[0] || '';
    }

    // Use weighted selection based on multiple factors
    return this.selectByWeightedRoundRobin(healthyKeys);
  }

  /**
   * Select API key using weighted round-robin algorithm
   */
  private selectByWeightedRoundRobin(healthyKeys: ApiKeyMetrics[]): string {
    const weightedKeys = healthyKeys.map(metrics => {
      const weight = this.calculateWeight(metrics);
      return {
        key: metrics.key,
        weight,
        metrics
      };
    });

    // Sort by weight (highest first) and select the best one
    weightedKeys.sort((a, b) => b.weight - a.weight);
    
    // Add some randomization among top performers to avoid always using the same key
    const topPerformers = weightedKeys.slice(0, Math.max(1, Math.ceil(weightedKeys.length * 0.3)));
    const selected = topPerformers[Math.floor(Math.random() * topPerformers.length)];
    
    return selected.key;
  }

  /**
   * Calculate weight for an API key based on multiple factors
   */
  private calculateWeight(metrics: ApiKeyMetrics): number {
    // Success rate (0-1)
    const successRate = metrics.totalRequests > 0 
      ? metrics.successCount / metrics.totalRequests 
      : 1;

    // Response time weight (inverse relationship - faster is better)
    const normalizedResponseTime = Math.max(
      this.config.minResponseTime,
      Math.min(this.config.maxResponseTime, metrics.avgResponseTime)
    );
    const responseTimeScore = this.config.maxResponseTime / normalizedResponseTime;

    // Usage frequency weight (prefer less recently used keys for load distribution)
    const timeSinceLastUse = Date.now() - metrics.lastUsed;
    const usageScore = Math.min(1, timeSinceLastUse / (5 * 60 * 1000)); // 5 minutes max

    // Combine weights
    const totalWeight = 
      (successRate * this.config.successRateWeight) +
      (responseTimeScore * this.config.responseTimeWeight) +
      (usageScore * this.config.usageFrequencyWeight);

    return totalWeight;
  }

  /**
   * Record a successful request
   */
  recordSuccess(apiKey: string, responseTime: number): void {
    const metrics = this.keyMetrics.get(apiKey);
    if (!metrics) return;

    metrics.successCount++;
    metrics.totalRequests++;
    metrics.consecutiveErrors = 0;
    metrics.lastUsed = Date.now();
    metrics.isHealthy = true;
    metrics.markedUnhealthyAt = undefined;

    // Update average response time using exponential moving average
    if (metrics.totalRequests === 1) {
      metrics.avgResponseTime = responseTime;
    } else {
      metrics.avgResponseTime = (metrics.avgResponseTime * 0.8) + (responseTime * 0.2);
    }
  }

  /**
   * Record a failed request
   */
  recordError(apiKey: string, responseTime?: number): void {
    const metrics = this.keyMetrics.get(apiKey);
    if (!metrics) return;

    metrics.errorCount++;
    metrics.totalRequests++;
    metrics.consecutiveErrors++;
    metrics.lastUsed = Date.now();

    if (responseTime) {
      // Update average response time even for errors
      if (metrics.totalRequests === 1) {
        metrics.avgResponseTime = responseTime;
      } else {
        metrics.avgResponseTime = (metrics.avgResponseTime * 0.8) + (responseTime * 0.2);
      }
    }

    // Mark as unhealthy if too many consecutive errors
    if (metrics.consecutiveErrors >= this.config.maxConsecutiveErrors) {
      metrics.isHealthy = false;
      metrics.markedUnhealthyAt = Date.now();
    }
  }

  /**
   * Reset all keys to healthy state (recovery mechanism)
   */
  private resetAllKeys(): void {
    this.keyMetrics.forEach(metrics => {
      metrics.isHealthy = true;
      metrics.consecutiveErrors = 0;
      metrics.lastHealthCheck = Date.now();
      metrics.markedUnhealthyAt = undefined;
    });
  }

  /**
   * Perform health check on unhealthy keys
   */
  performHealthCheck(): void {
    const now = Date.now();
    const unhealthyKeys = Array.from(this.keyMetrics.values())
      .filter(metrics => !metrics.isHealthy);

    unhealthyKeys.forEach(metrics => {
      // Auto-recover keys that have been unhealthy for a while
      const timeSinceMarkedUnhealthy = now - (metrics.markedUnhealthyAt || now);
      if (timeSinceMarkedUnhealthy > this.config.healthCheckInterval * 2) {
        metrics.isHealthy = true;
        metrics.consecutiveErrors = 0;
        metrics.lastHealthCheck = now;
        metrics.markedUnhealthyAt = undefined;
      }
    });
  }

  /**
   * Start the health check timer
   */
  private startHealthCheckTimer(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  /**
   * Stop the health check timer
   */
  stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * Get current metrics for all keys
   */
  getMetrics(): ApiKeyMetrics[] {
    return Array.from(this.keyMetrics.values());
  }

  /**
   * Get metrics for a specific key
   */
  getKeyMetrics(apiKey: string): ApiKeyMetrics | undefined {
    return this.keyMetrics.get(apiKey);
  }

  /**
   * Get health status summary
   */
  getHealthStatus(): {
    totalKeys: number;
    healthyKeys: number;
    unhealthyKeys: number;
    averageResponseTime: number;
    totalRequests: number;
    successRate: number;
  } {
    const metrics = Array.from(this.keyMetrics.values());
    const healthyKeys = metrics.filter(m => m.isHealthy);
    const totalRequests = metrics.reduce((sum, m) => sum + m.totalRequests, 0);
    const totalSuccesses = metrics.reduce((sum, m) => sum + m.successCount, 0);
    const avgResponseTime = metrics.reduce((sum, m) => sum + m.avgResponseTime, 0) / metrics.length;

    return {
      totalKeys: metrics.length,
      healthyKeys: healthyKeys.length,
      unhealthyKeys: metrics.length - healthyKeys.length,
      averageResponseTime: avgResponseTime,
      totalRequests,
      successRate: totalRequests > 0 ? totalSuccesses / totalRequests : 0
    };
  }

  /**
   * Add a new API key to the load balancer
   */
  addApiKey(apiKey: string): void {
    if (!this.keyMetrics.has(apiKey)) {
      this.keys.push(apiKey);
      this.keyMetrics.set(apiKey, {
        key: apiKey,
        successCount: 0,
        errorCount: 0,
        avgResponseTime: 1000,
        lastUsed: 0,
        consecutiveErrors: 0,
        isHealthy: true,
        totalRequests: 0,
        lastHealthCheck: Date.now(),
        markedUnhealthyAt: undefined
      });
    }
  }

  /**
   * Remove an API key from the load balancer
   */
  removeApiKey(apiKey: string): void {
    const index = this.keys.indexOf(apiKey);
    if (index > -1) {
      this.keys.splice(index, 1);
      this.keyMetrics.delete(apiKey);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<LoadBalancerConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopHealthCheck();
    this.keyMetrics.clear();
  }
}