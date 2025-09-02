// src/common/types.ts
import { Context } from 'hono';
import { Container } from '../logic/container';
import { LogLevel } from '../base/logging/logger';
import { RetryConfig } from '../base/http/retry';

// Define the variables that will be available in the Hono context.
export type AppContext = {
  Variables: {
    apiKeys: string[];
    container: Container;
  };
  Bindings: {
    DB: any; // D1 Database Binding
    KV: any; // KV Namespace Binding
  }
};

// A typed version of the Context object.
export type TypedContext = Context<AppContext>;

// 配置接口类型定义
export interface DatabaseConfig {
  connectionTimeout: number;
  queryTimeout: number;
}

export interface CacheConfig {
  maxSize: number;
  defaultTTL: number;
}

export interface HttpConfig {
  timeout: number;
  retryConfig: RetryConfig;
}

export interface LoggingConfig {
  level: LogLevel;
  enableConsole: boolean;
  maskSensitiveData: boolean;
}

export interface SecurityConfig {
  enableCors: boolean;
  allowedOrigins: string[];
  enableApiKeyValidation: boolean;
}

export interface MonitoringConfig {
  enableRequestLogging: boolean;
  enablePerformanceMetrics: boolean;
}

export interface AppConfig {
  version: string;
  database: DatabaseConfig;
  cache: CacheConfig;
  http: HttpConfig;
  logging: LoggingConfig;
  security: SecurityConfig;
  monitoring: MonitoringConfig;
}