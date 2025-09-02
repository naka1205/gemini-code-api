// src/config/app.ts
import { LogLevel } from '../base/logging/logger';
import { APP_INFO, APP_CONFIG } from '../common/constants';
import type { 
  AppConfig, 
  DatabaseConfig, 
  CacheConfig, 
  HttpConfig, 
  LoggingConfig, 
  SecurityConfig, 
  MonitoringConfig 
} from '../common/types';

/**
 * 默认配置，使用常量定义
 */
const DEFAULT_CONFIG: AppConfig = {
  version: APP_INFO.VERSION,
  database: {
    connectionTimeout: APP_CONFIG.DATABASE.CONNECTION_TIMEOUT,
    queryTimeout: APP_CONFIG.DATABASE.QUERY_TIMEOUT
  },
  cache: {
    maxSize: APP_CONFIG.CACHE.MAX_SIZE,
    defaultTTL: APP_CONFIG.CACHE.DEFAULT_TTL
  },
  http: {
    timeout: APP_CONFIG.HTTP.TIMEOUT,
    retryConfig: {
      maxAttempts: APP_CONFIG.HTTP.RETRY.MAX_ATTEMPTS,
      baseDelay: APP_CONFIG.HTTP.RETRY.BASE_DELAY,
      maxDelay: APP_CONFIG.HTTP.RETRY.MAX_DELAY,
      exponentialBase: APP_CONFIG.HTTP.RETRY.EXPONENTIAL_BASE,
      jitter: APP_CONFIG.HTTP.RETRY.JITTER,
      retryableStatusCodes: [...APP_CONFIG.HTTP.RETRY.RETRYABLE_STATUS_CODES],
      retryableErrors: [...APP_CONFIG.HTTP.RETRY.RETRYABLE_ERRORS]
    }
  },
  logging: {
    level: APP_CONFIG.LOGGING.LEVEL as LogLevel, // 类型转换
    enableConsole: APP_CONFIG.LOGGING.ENABLE_CONSOLE,
    maskSensitiveData: APP_CONFIG.LOGGING.MASK_SENSITIVE_DATA
  },
  security: {
    enableCors: APP_CONFIG.SECURITY.ENABLE_CORS,
    allowedOrigins: [...APP_CONFIG.SECURITY.ALLOWED_ORIGINS],
    enableApiKeyValidation: APP_CONFIG.SECURITY.ENABLE_API_KEY_VALIDATION
  },
  monitoring: {
    enableRequestLogging: APP_CONFIG.MONITORING.ENABLE_REQUEST_LOGGING,
    enablePerformanceMetrics: APP_CONFIG.MONITORING.ENABLE_PERFORMANCE_METRICS
  }
};

/**
 * 配置管理器类
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private config: AppConfig;

  private constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  // Getter methods
  public getConfig(): AppConfig { return { ...this.config }; }
  public getDatabaseConfig(): DatabaseConfig { return { ...this.config.database }; }
  public getCacheConfig(): CacheConfig { return { ...this.config.cache }; }
  public getHttpConfig(): HttpConfig { return { ...this.config.http }; }
  public getLoggingConfig(): LoggingConfig { return { ...this.config.logging }; }
  public getSecurityConfig(): SecurityConfig { return { ...this.config.security }; }
  public getMonitoringConfig(): MonitoringConfig { return { ...this.config.monitoring }; }
  public getVersion(): string { return this.config.version; }
}

/**
 * 全局配置实例
 */
export const appConfig = ConfigManager.getInstance();

/**
 * 便捷函数
 */
export const getConfig = () => appConfig.getConfig();
export const getDatabaseConfig = () => appConfig.getDatabaseConfig();
export const getCacheConfig = () => appConfig.getCacheConfig();
export const getHttpConfig = () => appConfig.getHttpConfig();
export const getLoggingConfig = () => appConfig.getLoggingConfig();
export const getSecurityConfig = () => appConfig.getSecurityConfig();
export const getMonitoringConfig = () => appConfig.getMonitoringConfig();