/**
 * HTTP重试逻辑
 * 智能重试策略和指数退避算法
 */
import type { HttpError } from '../../types/index.js';
import { sleep } from '../../utils/helpers.js';

/**
 * 重试策略配置
 */
export interface RetryStrategyOptions {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitterEnabled: boolean; // 是否启用抖动
  retryCondition?: (error: HttpError, attempt: number) => boolean;
}

/**
 * 重试结果
 */
export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attemptCount: number;
  totalDelay: number;
}

/**
 * HTTP重试策略类
 */
export class RetryStrategy {
  private config: RetryStrategyOptions;

  constructor(options: Partial<RetryStrategyOptions> = {}) {
    this.config = {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitterEnabled: true,
      ...options,
    };
  }

  /**
   * 执行带重试的异步操作
   */
  async execute<T>(operation: () => Promise<T>): Promise<RetryResult<T>> {
    let lastError: Error;
    let totalDelay = 0;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const data = await operation();
        return {
          success: true,
          data,
          attemptCount: attempt + 1,
          totalDelay,
        };
      } catch (error) {
        lastError = error as Error;

        // 检查是否应该重试
        if (!this.shouldRetry(error as HttpError, attempt)) {
          break;
        }

        // 如果不是最后一次尝试，等待后重试
        if (attempt < this.config.maxRetries) {
          const delay = this.calculateDelay(attempt);
          totalDelay += delay;
          await sleep(delay);
        }
      }
    }

    return {
      success: false,
      error: lastError!,
      attemptCount: this.config.maxRetries + 1,
      totalDelay,
    };
  }

  /**
   * 判断是否应该重试
   */
  private shouldRetry(error: HttpError, attempt: number): boolean {
    // 已达到最大重试次数
    if (attempt >= this.config.maxRetries) {
      return false;
    }

    // 使用自定义重试条件
    if (this.config.retryCondition) {
      return this.config.retryCondition(error, attempt);
    }

    // 默认重试条件
    return this.isRetryableError(error);
  }

  /**
   * 判断错误是否可重试
   */
  private isRetryableError(error: HttpError): boolean {
    // 网络错误
    if (error.name === 'TypeError' || error.name === 'AbortError') {
      return true;
    }

    // HTTP状态码错误
    if (error.status) {
      const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
      return retryableStatusCodes.includes(error.status);
    }

    // 特定错误消息
    const retryableMessages = [
      'NETWORK_ERROR',
      'TIMEOUT',
      'CONNECTION_RESET',
      'ECONNRESET',
      'ENOTFOUND',
      'ECONNREFUSED',
    ];

    return retryableMessages.some(msg => 
      error.message.toUpperCase().includes(msg)
    );
  }

  /**
   * 计算重试延迟
   */
  private calculateDelay(attempt: number): number {
    // 指数退避
    let delay = this.config.initialDelay * Math.pow(this.config.backoffMultiplier, attempt);

    // 限制最大延迟
    delay = Math.min(delay, this.config.maxDelay);

    // 添加抖动以避免惊群效应
    if (this.config.jitterEnabled) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return Math.floor(delay);
  }

  /**
   * 更新重试配置
   */
  updateConfig(options: Partial<RetryStrategyOptions>): void {
    this.config = { ...this.config, ...options };
  }

  /**
   * 获取当前配置
   */
  getConfig(): RetryStrategyOptions {
    return { ...this.config };
  }
}

/**
 * 预定义的重试策略
 */
export const RetryStrategies = {
  /**
   * 保守策略 - 较少重试次数，较长间隔
   */
  conservative: new RetryStrategy({
    maxRetries: 2,
    initialDelay: 2000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitterEnabled: true,
  }),

  /**
   * 标准策略 - 平衡的重试配置
   */
  standard: new RetryStrategy({
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitterEnabled: true,
  }),

  /**
   * 激进策略 - 更多重试次数，更短间隔
   */
  aggressive: new RetryStrategy({
    maxRetries: 5,
    initialDelay: 500,
    maxDelay: 15000,
    backoffMultiplier: 1.5,
    jitterEnabled: true,
  }),

  /**
   * 快速失败策略 - 不重试或很少重试
   */
  fastFail: new RetryStrategy({
    maxRetries: 1,
    initialDelay: 500,
    maxDelay: 2000,
    backoffMultiplier: 1,
    jitterEnabled: false,
  }),
};

/**
 * 装饰器函数，为函数添加重试功能
 */
export function withRetry<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  strategy: RetryStrategy = RetryStrategies.standard
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const result = await strategy.execute(() => fn(...args));
    
    if (result.success) {
      return result.data;
    } else {
      throw result.error;
    }
  }) as T;
}

/**
 * 创建自定义重试条件
 */
export function createRetryCondition(
  conditions: {
    statusCodes?: number[];
    errorTypes?: string[];
    errorMessages?: string[];
    maxAttempts?: number;
  }
): (error: HttpError, attempt: number) => boolean {
  return (error: HttpError, attempt: number): boolean => {
    if (conditions.maxAttempts && attempt >= conditions.maxAttempts) {
      return false;
    }

    if (conditions.statusCodes && error.status) {
      return conditions.statusCodes.includes(error.status);
    }

    if (conditions.errorTypes && conditions.errorTypes.includes(error.name)) {
      return true;
    }

    if (conditions.errorMessages) {
      return conditions.errorMessages.some(msg => 
        error.message.toLowerCase().includes(msg.toLowerCase())
      );
    }

    return false;
  };
}