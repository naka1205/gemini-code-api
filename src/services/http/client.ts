/**
 * HTTP客户端实现
 * 支持重试、超时、连接复用
 */
import type { 
  HttpClient, 
  HttpRequestOptions, 
  HttpResponse, 
  StreamRequestOptions,
  HttpError,
  RetryConfig 
} from '@/types';
import { HTTP_CONFIG } from '@/utils/constants.js';
import { sleep } from '@/utils/helpers.js';

export class HttpClientImpl implements HttpClient {
  private retryConfig: RetryConfig;

  constructor(retryConfig?: Partial<RetryConfig>) {
    this.retryConfig = {
      maxRetries: HTTP_CONFIG.MAX_RETRIES,
      initialDelay: HTTP_CONFIG.INITIAL_RETRY_DELAY,
      maxDelay: HTTP_CONFIG.MAX_RETRY_DELAY,
      backoffMultiplier: HTTP_CONFIG.BACKOFF_MULTIPLIER,
      retryableStatusCodes: [...HTTP_CONFIG.RETRYABLE_STATUS_CODES], // 复制为可变数组
      retryableErrors: [...HTTP_CONFIG.RETRYABLE_ERRORS], // 复制为可变数组
      ...retryConfig,
    };
  }

  async get<T = any>(url: string, options?: HttpRequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: 'GET' });
  }

  async post<T = any>(url: string, data?: any, options?: HttpRequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>(url, { 
      ...options, 
      method: 'POST',
      body: data 
    });
  }

  async put<T = any>(url: string, data?: any, options?: HttpRequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>(url, { 
      ...options, 
      method: 'PUT',
      body: data 
    });
  }

  async delete<T = any>(url: string, options?: HttpRequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: 'DELETE' });
  }

  async patch<T = any>(url: string, data?: any, options?: HttpRequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>(url, { 
      ...options, 
      method: 'PATCH',
      body: data 
    });
  }

  async stream(options: StreamRequestOptions): Promise<ReadableStream> {
    const { url, ...requestOptions } = options;
    const requestInit = await this.buildRequestInit(requestOptions);
    
    try {
      const response = await fetch(url, requestInit);
      
      if (!response.ok) {
        throw this.createHttpError(`HTTP ${response.status}: ${response.statusText}`, response.status, {
          status: response.status,
          statusText: response.statusText,
          headers: this.parseHeaders(response.headers),
          data: null,
          ok: response.ok,
          redirected: response.redirected,
          url: response.url,
        });
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      return response.body;
    } catch (error) {
      throw this.handleRequestError(error as Error, url);
    }
  }

  async request<T = any>(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
    const maxRetries = options.retries ?? this.retryConfig.maxRetries;
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeRequest<T>(url, options);
      } catch (error) {
        lastError = error as Error;
        
        // 不重试非网络错误
        if (!this.shouldRetry(error as HttpError, attempt, maxRetries)) {
          throw lastError;
        }

        // 计算重试延迟
        const delay = Math.min(
          this.retryConfig.initialDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt),
          this.retryConfig.maxDelay
        );

        await sleep(delay);
      }
    }

    throw lastError!;
  }

  private async executeRequest<T>(url: string, options: HttpRequestOptions): Promise<HttpResponse<T>> {
    const requestInit = await this.buildRequestInit(options);
    const timeout = options.timeout ?? HTTP_CONFIG.TIMEOUT;

    // 创建带超时的请求
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...requestInit,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const headers = this.parseHeaders(response.headers);
      let data: T;

      try {
        const text = await response.text();
        data = text ? JSON.parse(text) : null;
      } catch {
        // 如果无法解析为JSON，返回原始文本
        data = await response.text() as T;
      }

      const httpResponse: HttpResponse<T> = {
        status: response.status,
        statusText: response.statusText,
        headers,
        data,
        ok: response.ok,
        redirected: response.redirected,
        url: response.url,
      };

      if (!response.ok) {
        throw this.createHttpError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          httpResponse
        );
      }

      return httpResponse;
    } catch (error) {
      clearTimeout(timeoutId);
      throw this.handleRequestError(error as Error, url);
    }
  }

  private async buildRequestInit(options: HttpRequestOptions): Promise<RequestInit> {
    const headers = new Headers(options.headers);
    
    // 设置默认Content-Type
    if (options.body && !headers.has('Content-Type')) {
      if (typeof options.body === 'object') {
        headers.set('Content-Type', 'application/json');
      }
    }

    // 设置User-Agent
    if (!headers.has('User-Agent')) {
      headers.set('User-Agent', 'gemini-code-api/2.0.0');
    }

    let body: string | undefined;
    if (options.body) {
      if (typeof options.body === 'string') {
        body = options.body;
      } else {
        body = JSON.stringify(options.body);
      }
    }

    return {
      method: options.method || 'GET',
      headers,
      body: body || null, // 确保body是BodyInit | null类型
    };
  }

  private parseHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  private shouldRetry(error: HttpError, attempt: number, maxRetries: number): boolean {
    // 不重试如果已达到最大重试次数
    if (attempt >= maxRetries) {
      return false;
    }

    // 重试网络错误
    if (error.name === 'TypeError' || error.name === 'AbortError') {
      return true;
    }

    // 重试特定状态码
    if (error.status && this.retryConfig.retryableStatusCodes.includes(error.status)) {
      return true;
    }

    // 重试特定错误类型
    if (this.retryConfig.retryableErrors.some(retryableError => 
      error.message.includes(retryableError)
    )) {
      return true;
    }

    return false;
  }

  private createHttpError(message: string, status?: number, response?: HttpResponse): HttpError {
    const error = new Error(message) as HttpError;
    error.name = 'HttpError';
    error.status = status || 0; // 明确处理undefined
    error.response = response ?? undefined;
    return error;
  }

  private handleRequestError(error: Error, url: string): HttpError {
    if (error.name === 'AbortError') {
      return this.createHttpError(`Request timeout for ${url}`, 408);
    }

    if (error.name === 'TypeError') {
      return this.createHttpError(`Network error for ${url}: ${error.message}`);
    }

    return error as HttpError;
  }
}

/**
 * 全局HTTP客户端实例
 */
export const httpClient = new HttpClientImpl();