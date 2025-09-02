// src/base/http/retry.ts
import { getGlobalLogger } from '../logging/logger';

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;         // Base delay in milliseconds
  maxDelay: number;          // Maximum delay in milliseconds
  exponentialBase: number;   // Exponential backoff base
  jitter: boolean;           // Add random jitter to prevent thundering herd
  retryableStatusCodes: number[];
  retryableErrors: string[];
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,          // 1 second
  maxDelay: 30000,          // 30 seconds
  exponentialBase: 2,
  jitter: true,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524],
  retryableErrors: ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']
};

export interface RetryState {
  attempt: number;
  lastError?: Error;
  lastResponse?: Response;
  totalDelay: number;
}

export class RetryHandler {
  private logger = getGlobalLogger();
  
  constructor(private config: RetryConfig = DEFAULT_RETRY_CONFIG) {}

  /**
   * Execute a function with retry logic
   */
  async execute<T>(
    operation: () => Promise<T>,
    context: { url?: string; method?: string } = {}
  ): Promise<T> {
    const state: RetryState = {
      attempt: 0,
      totalDelay: 0
    };

    while (state.attempt < this.config.maxAttempts) {
      state.attempt++;
      
      try {
        const result = await operation();
        
        // Check if result is a Response and if it needs retry
        if (result instanceof Response) {
          if (this.shouldRetryResponse(result)) {
            state.lastResponse = result;
            if (state.attempt < this.config.maxAttempts) {
              await this.delay(state);
              continue;
            }
          }
        }
        
        if (state.attempt > 1) {
          this.logger.info('Operation succeeded after retry', {
            attempt: state.attempt,
            totalDelay: state.totalDelay,
            url: context.url,
            method: context.method
          });
        }
        
        return result;
      } catch (error) {
        state.lastError = error instanceof Error ? error : new Error(String(error));
        
        if (!this.shouldRetryError(state.lastError) || state.attempt >= this.config.maxAttempts) {
          this.logger.error('Operation failed after all retries', state.lastError, {
            attempts: state.attempt,
            totalDelay: state.totalDelay,
            url: context.url,
            method: context.method
          });
          throw state.lastError;
        }
        
        this.logger.warn('Operation failed, retrying', {
          attempt: state.attempt,
          maxAttempts: this.config.maxAttempts,
          url: context.url,
          method: context.method
        });
        
        await this.delay(state);
      }
    }

    // Should never reach here, but TypeScript needs this
    throw state.lastError || new Error('Max retry attempts exceeded');
  }

  /**
   * Check if an HTTP response should be retried
   */
  private shouldRetryResponse(response: Response): boolean {
    return this.config.retryableStatusCodes.includes(response.status);
  }

  /**
   * Check if an error should be retried
   */
  private shouldRetryError(error: Error): boolean {
    // Check for network-level errors
    return this.config.retryableErrors.some(retryableError => 
      error.message.includes(retryableError) || 
      error.name.includes(retryableError)
    );
  }

  /**
   * Calculate delay and wait before next retry
   */
  private async delay(state: RetryState): Promise<void> {
    const delayMs = this.calculateDelay(state.attempt);
    state.totalDelay += delayMs;
    
    this.logger.debug('Retrying after delay', {
      attempt: state.attempt,
      delayMs,
      totalDelay: state.totalDelay
    });
    
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.config.baseDelay * Math.pow(this.config.exponentialBase, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelay);
    
    if (!this.config.jitter) {
      return cappedDelay;
    }
    
    // Add jitter: random value between 0.5 and 1.5 times the calculated delay
    const jitterMultiplier = 0.5 + Math.random();
    return Math.floor(cappedDelay * jitterMultiplier);
  }

  /**
   * Create a new RetryHandler with custom config
   */
  static create(config: Partial<RetryConfig>): RetryHandler {
    return new RetryHandler({ ...DEFAULT_RETRY_CONFIG, ...config });
  }
}