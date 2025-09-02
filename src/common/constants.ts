/**
 * 项目常量定义
 * 只包含实际使用的常量
 */

// 应用信息
export const APP_INFO = {
  NAME: 'Gemini Code API',
  VERSION: '1.0.0',
  DESCRIPTION: 'Multi-protocol AI API Gateway using Gemini as unified backend'
} as const;

// Gemini API 配置
export const GEMINI_CONFIG = {
  BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/models',
  TIMEOUT: 30000
} as const;

// 错误消息
export const ERROR_MESSAGES = {
  NO_API_KEY: 'API key is required',
  INVALID_API_KEY: 'Invalid API key format',
  QUOTA_EXCEEDED: 'Quota limit exceeded',
  RATE_LIMITED: 'Rate limit exceeded',
  BLACKLISTED_KEY: 'API key is blacklisted',
  INTERNAL_ERROR: 'Internal server error',
  TIMEOUT: 'Request timeout',
  INVALID_REQUEST: 'Invalid request format'
} as const;

// 应用配置常量
export const APP_CONFIG = {
  // 数据库配置
  DATABASE: {
    CONNECTION_TIMEOUT: 10000,
    QUERY_TIMEOUT: 30000
  },

  // 缓存配置
  CACHE: {
    MAX_SIZE: 1000,
    DEFAULT_TTL: 300000 // 5 minutes
  },

  // HTTP 配置
  HTTP: {
    TIMEOUT: 30000,
    RETRY: {
      MAX_ATTEMPTS: 3,
      BASE_DELAY: 1000,
      MAX_DELAY: 30000,
      EXPONENTIAL_BASE: 2,
      JITTER: true,
      RETRYABLE_STATUS_CODES: [408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524],
      RETRYABLE_ERRORS: ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']
    }
  },

  // 日志配置
  LOGGING: {
    LEVEL: 1, // 对应 LogLevel.INFO
    ENABLE_CONSOLE: true,
    MASK_SENSITIVE_DATA: true
  },

  // 安全配置
  SECURITY: {
    ENABLE_CORS: true,
    ALLOWED_ORIGINS: ['*'], // 网关模式，允许所有来源
    ENABLE_API_KEY_VALIDATION: true
  },

  // 监控配置
  MONITORING: {
    ENABLE_REQUEST_LOGGING: true,
    ENABLE_PERFORMANCE_METRICS: true
  }
} as const;