// src/utils/proxy.ts
import type { Context } from 'hono';

export interface ApiKeyMetrics {
  key: string;
  successCount: number;
  errorCount: number;
  avgResponseTime: number;
  lastUsed: number;
  consecutiveErrors: number;
  isHealthy: boolean;
}

export class IntelligentLoadBalancer {
  private keyMetrics = new Map<string, ApiKeyMetrics>();
  private readonly maxConsecutiveErrors = 3;
  private readonly healthCheckInterval = 60000; // 1分钟

  constructor(private keys: string[]) {
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    this.keys.forEach(key => {
      this.keyMetrics.set(key, {
        key,
        successCount: 0,
        errorCount: 0,
        avgResponseTime: 0,
        lastUsed: 0,
        consecutiveErrors: 0,
        isHealthy: true
      });
    });
  }

  selectApiKey(): string {
    const healthyKeys = Array.from(this.keyMetrics.values())
      .filter(metrics => metrics.isHealthy);

    if (healthyKeys.length === 0) {
      // 如果没有健康的密钥，重置所有密钥状态
      this.resetAllKeys();
      return this.keys[0];
    }

    // 基于加权轮询算法选择密钥
    return this.selectByWeightedRoundRobin(healthyKeys);
  }

  private selectByWeightedRoundRobin(healthyKeys: ApiKeyMetrics[]): string {
    // 计算权重：成功率 * 响应速度权重 * 使用频率权重
    const weightedKeys = healthyKeys.map(metrics => {
      const successRate = metrics.successCount / (metrics.successCount + metrics.errorCount) || 1;
      const responseTimeWeight = Math.max(0.1, 1 / (metrics.avgResponseTime || 1000));
      const usageWeight = Math.max(0.5, 1 / (Date.now() - metrics.lastUsed + 1));

      return {
        key: metrics.key,
        weight: successRate * responseTimeWeight * usageWeight
      };
    });

    // 选择权重最高的密钥
    const selected = weightedKeys.reduce((prev, current) =>
      current.weight > prev.weight ? current : prev
    );

    return selected.key;
  }

  recordSuccess(apiKey: string, responseTime: number): void {
    const metrics = this.keyMetrics.get(apiKey);
    if (!metrics) return;

    metrics.successCount++;
    metrics.consecutiveErrors = 0;
    metrics.avgResponseTime = (metrics.avgResponseTime + responseTime) / 2;
    metrics.lastUsed = Date.now();
    metrics.isHealthy = true;
  }

  recordError(apiKey: string, responseTime?: number): void {
    const metrics = this.keyMetrics.get(apiKey);
    if (!metrics) return;

    metrics.errorCount++;
    metrics.consecutiveErrors++;
    metrics.lastUsed = Date.now();

    if (responseTime) {
      metrics.avgResponseTime = (metrics.avgResponseTime + responseTime) / 2;
    }

    // 如果连续错误超过阈值，标记为不健康
    if (metrics.consecutiveErrors >= this.maxConsecutiveErrors) {
      metrics.isHealthy = false;
    }
  }

  private resetAllKeys(): void {
    this.keyMetrics.forEach(metrics => {
      metrics.isHealthy = true;
      metrics.consecutiveErrors = 0;
    });
  }

  getMetrics(): ApiKeyMetrics[] {
    return Array.from(this.keyMetrics.values());
  }
}

export function getApiKeysFromRequest(c: Context): string[] {
  const authHeader = c.req.header('Authorization');
  const googHeader = c.req.header('x-goog-api-key');

  let keys: string[] = [];

  if (authHeader && authHeader.startsWith('Bearer ')) {
    keys = authHeader.substring(7).split(',').map(k => k.trim()).filter(Boolean);
  } else if (googHeader) {
    keys = googHeader.split(',').map(k => k.trim()).filter(Boolean);
  }

  return keys;
}

export function selectApiKey(keys: string[]): string | null {
  if (keys.length === 0) {
    return null;
  }
  const index = Math.floor(Math.random() * keys.length);
  return keys[index];
}

export async function proxyRequest(c: Context, geminiRequest: any, loadBalancer?: IntelligentLoadBalancer) {
  const clientApiKeys = getApiKeysFromRequest(c);
  
  let selectedKey: string | null = null;
  
  if (loadBalancer && clientApiKeys.length > 0) {
    // 使用智能负载均衡器
    selectedKey = loadBalancer.selectApiKey();
  } else {
    // 回退到简单随机选择
    selectedKey = selectApiKey(clientApiKeys);
  }

  if (!selectedKey) {
    throw new Error('API key not provided. Please include it in the `Authorization` header (e.g., `Bearer YOUR_API_KEY`) or `x-goog-api-key` header.');
  }

  // Extract model and stream status for logging
  const model = geminiRequest.model || 'gemini-pro';
  const isStream = geminiRequest.stream || false;

  const basePath = 'https://generativelanguage.googleapis.com';
  const modelPath = `/v1beta/models/${model}:${isStream ? 'streamGenerateContent' : 'generateContent'}`;
  const targetUrl = new URL(modelPath, basePath);

  const startTime = Date.now();

  try {
    const response = await fetch(targetUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': selectedKey,
      },
      body: JSON.stringify(geminiRequest.body),
    });

    const responseTime = Date.now() - startTime;

    if (loadBalancer) {
      if (response.ok) {
        loadBalancer.recordSuccess(selectedKey, responseTime);
      } else {
        loadBalancer.recordError(selectedKey, responseTime);
      }
    }

    return {
      response,
      selectedKey,
      model,
      isStream,
      responseTime
    };
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    
    if (loadBalancer) {
      loadBalancer.recordError(selectedKey, responseTime);
    }

    throw new Error(`Failed to proxy request to Gemini: ${error.message}`);
  }
}