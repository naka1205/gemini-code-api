/**
 * 通用类型定义
 * 系统核心类型和枚举
 */

// 客户端类型枚举
export type ClientType = 'openai' | 'claude' | 'gemini' | 'unknown';

// HTTP方法类型
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS';

// 基础响应接口
export interface BaseResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

// 分页响应接口
export interface PaginatedResponse<T> extends BaseResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

// 错误类型枚举
export enum ErrorType {
  AUTHENTICATION_ERROR = 'authentication_error',
  VALIDATION_ERROR = 'validation_error',
  RATE_LIMIT_ERROR = 'rate_limit_error',
  API_ERROR = 'api_error',
  INTERNAL_ERROR = 'internal_error',
  NETWORK_ERROR = 'network_error',
}

// 日志级别枚举
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

// 状态枚举
export enum Status {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
  PENDING = 'pending',
}