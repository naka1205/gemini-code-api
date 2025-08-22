/**
 * HTTP客户端相关类型定义
 */
import type { HttpMethod } from './common.js';

// HTTP请求选项
export interface HttpRequestOptions {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

// HTTP响应
export interface HttpResponse<T = any> {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: T;
  ok: boolean;
  redirected: boolean;
  url: string;
}

// 流式请求选项
export interface StreamRequestOptions extends HttpRequestOptions {
  url: string;
}

// HTTP错误
export interface HttpError extends Error {
  status?: number;
  statusText?: string;
  response?: HttpResponse | undefined;
}

// 重试配置
export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
  retryableErrors: string[];
}

// HTTP客户端接口
export interface HttpClient {
  get<T = any>(url: string, options?: HttpRequestOptions): Promise<HttpResponse<T>>;
  post<T = any>(url: string, data?: any, options?: HttpRequestOptions): Promise<HttpResponse<T>>;
  put<T = any>(url: string, data?: any, options?: HttpRequestOptions): Promise<HttpResponse<T>>;
  delete<T = any>(url: string, options?: HttpRequestOptions): Promise<HttpResponse<T>>;
  patch<T = any>(url: string, data?: any, options?: HttpRequestOptions): Promise<HttpResponse<T>>;
  stream(options: StreamRequestOptions): Promise<ReadableStream>;
  request<T = any>(url: string, options: HttpRequestOptions): Promise<HttpResponse<T>>;
}