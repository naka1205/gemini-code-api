// src/base/http/client.ts
import { RetryHandler, DEFAULT_RETRY_CONFIG, RetryConfig } from './retry';
import { getGlobalLogger } from '../logging/logger';

export interface RequestOptions {
  headers: Record<string, string>;
  timeout?: number;
  retryConfig?: Partial<RetryConfig>;
}

export interface RequestContext {
  url: string;
  method: string;
  startTime: number;
  attempt: number;
}

export class HttpClient {
  private logger = getGlobalLogger();
  private defaultTimeout = 30000; // 30 seconds
  private retryHandler: RetryHandler;

  constructor(retryConfig: Partial<RetryConfig> = {}) {
    this.retryHandler = new RetryHandler({ ...DEFAULT_RETRY_CONFIG, ...retryConfig });
  }

  async post(url: string, body: any, options: RequestOptions): Promise<Response> {
    const context: RequestContext = {
      url,
      method: 'POST',
      startTime: Date.now(),
      attempt: 0
    };

    return this.retryHandler.execute(async () => {
      context.attempt++;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, options.timeout || this.defaultTimeout);

      try {
        this.logger.debug('Making HTTP request', {
          url,
          method: 'POST',
          attempt: context.attempt,
          headers: this.maskSensitiveHeaders(options.headers)
        });

        const response = await fetch(url, {
          method: 'POST',
          body: JSON.stringify(body),
          headers: {
            'Content-Type': 'application/json',
            ...options.headers
          },
          signal: controller.signal
        });

        const duration = Date.now() - context.startTime;
        
        if (!response.ok) {
          this.logger.warn('HTTP request failed', {
            url,
            method: 'POST',
            status: response.status,
            statusText: response.statusText,
            attempt: context.attempt,
            duration
          });
        } else {
          this.logger.debug('HTTP request succeeded', {
            url,
            method: 'POST',
            status: response.status,
            attempt: context.attempt,
            duration
          });
        }

        return response;
      } catch (error) {
        const duration = Date.now() - context.startTime;
        
        if (error instanceof Error && error.name === 'AbortError') {
          const timeoutError = new Error(`Request timeout after ${options.timeout || this.defaultTimeout}ms`);
          timeoutError.name = 'ETIMEDOUT';
          this.logger.error('HTTP request timeout', timeoutError, {
            url,
            method: 'POST',
            attempt: context.attempt,
            duration,
            timeout: options.timeout || this.defaultTimeout
          });
          throw timeoutError;
        }

        this.logger.error('HTTP request error', error instanceof Error ? error : new Error(String(error)), {
          url,
          method: 'POST',
          attempt: context.attempt,
          duration
        });
        
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }, { url, method: 'POST' });
  }

  async get(url: string, options: Omit<RequestOptions, 'body'> = { headers: {} }): Promise<Response> {
    const context: RequestContext = {
      url,
      method: 'GET',
      startTime: Date.now(),
      attempt: 0
    };

    return this.retryHandler.execute(async () => {
      context.attempt++;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, options.timeout || this.defaultTimeout);

      try {
        this.logger.debug('Making HTTP request', {
          url,
          method: 'GET',
          attempt: context.attempt,
          headers: this.maskSensitiveHeaders(options.headers)
        });

        const response = await fetch(url, {
          method: 'GET',
          headers: options.headers,
          signal: controller.signal
        });

        const duration = Date.now() - context.startTime;
        
        if (!response.ok) {
          this.logger.warn('HTTP request failed', {
            url,
            method: 'GET',
            status: response.status,
            statusText: response.statusText,
            attempt: context.attempt,
            duration
          });
        } else {
          this.logger.debug('HTTP request succeeded', {
            url,
            method: 'GET',
            status: response.status,
            attempt: context.attempt,
            duration
          });
        }

        return response;
      } catch (error) {
        const duration = Date.now() - context.startTime;
        
        if (error instanceof Error && error.name === 'AbortError') {
          const timeoutError = new Error(`Request timeout after ${options.timeout || this.defaultTimeout}ms`);
          timeoutError.name = 'ETIMEDOUT';
          this.logger.error('HTTP request timeout', timeoutError, {
            url,
            method: 'GET',
            attempt: context.attempt,
            duration,
            timeout: options.timeout || this.defaultTimeout
          });
          throw timeoutError;
        }

        this.logger.error('HTTP request error', error instanceof Error ? error : new Error(String(error)), {
          url,
          method: 'GET',
          attempt: context.attempt,
          duration
        });
        
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }, { url, method: 'GET' });
  }

  /**
   * Mask sensitive information in headers for logging
   */
  private maskSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
    const masked = { ...headers };
    const sensitiveHeaders = ['authorization', 'x-api-key', 'x-goog-api-key'];
    
    for (const header of sensitiveHeaders) {
      if (masked[header]) {
        masked[header] = '***MASKED***';
      }
      if (masked[header.toLowerCase()]) {
        masked[header.toLowerCase()] = '***MASKED***';
      }
    }
    
    return masked;
  }

  /**
   * Create HTTP client with custom retry configuration
   */
  static create(retryConfig?: Partial<RetryConfig>): HttpClient {
    return new HttpClient(retryConfig);
  }

  /**
   * Set default timeout for all requests
   */
  setDefaultTimeout(timeout: number): void {
    this.defaultTimeout = timeout;
  }

  /**
   * Get current default timeout
   */
  getDefaultTimeout(): number {
    return this.defaultTimeout;
  }
}