/**
 * 系统配置常量
 * 纯代理模式 - 无API KEY存储
 */

// API基础配置
export const API_CONFIG = {
  GEMINI_BASE_URL: 'https://generativelanguage.googleapis.com',
  GEMINI_API_VERSION: 'v1beta',
  DEFAULT_TIMEOUT: 30000,
  MAX_RETRIES: 3,
  REQUEST_ID_LENGTH: 16,
} as const;

// ❌ 纯代理模式：系统不提供默认KEY
// export const DEFAULT_API_KEYS = []; // 已移除

// 负载均衡配置
export const LOAD_BALANCER_CONFIG = {
  MAX_CONSECUTIVE_ERRORS: 5,           // 连续失败阈值
  PERFORMANCE_WINDOW: 300000,          // 性能评估窗口(5分钟)
  RESPONSE_TIME_WEIGHT: 0.6,           // 响应时间权重
  SUCCESS_RATE_WEIGHT: 0.4,            // 成功率权重
  MIN_REQUESTS_FOR_STATS: 3,           // 统计最小请求数
  UNHEALTHY_THRESHOLD: 0.5,            // 不健康阈值(50%失败率)
  RECOVERY_CHECK_INTERVAL: 60000,      // 恢复检查间隔(1分钟)
} as const;

// 模型映射配置
export const MODEL_MAPPINGS = {
  // OpenAI -> Gemini
  'gpt-4': 'gemini-2.5-flash',
  'gpt-4o': 'gemini-2.5-pro',
  'gpt-4o-mini': 'gemini-2.5-flash',
  'gpt-4-turbo': 'gemini-2.5-flash',
  'gpt-3.5-turbo': 'gemini-2.0-flash',

  // Claude -> Gemini
  'claude-opus-4-20250514': 'gemini-2.5-pro',
  'claude-sonnet-4-20250514': 'gemini-2.5-flash',
  'claude-3-7-sonnet-20250219': 'gemini-2.5-flash',
  'claude-3-5-sonnet-20241022': 'gemini-2.0-flash',
  'claude-3-5-haiku-20241022': 'gemini-2.0-flash',
  'claude-3-opus-20240229': 'gemini-2.0-flash',
  'claude-3-sonnet-20240229': 'gemini-2.0-flash',

  // 嵌入模型
  'text-embedding-ada-002': 'text-embedding-004',
  'text-embedding-3-small': 'text-embedding-004',
  'text-embedding-3-large': 'text-multilingual-embedding-002',
} as const;

// 支持思考(Thinking)的模型白名单（以官方文档为准）
export const THINKING_SUPPORTED_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
] as const;

// 检测模型是否支持思考：考虑可能的后缀（如 -latest、-exp 等）
export function isThinkingSupportedModel(model: string): boolean {
  if (!model) return false;
  const normalized = model.trim().toLowerCase();
  return (
    normalized.startsWith('gemini-2.5-flash') ||
    normalized.startsWith('gemini-2.5-pro')
  );
}

// 缓存配置
export const CACHE_CONFIG = {
  MODEL_LIST_TTL: 3600000,             // 模型列表缓存1小时
  HEALTH_CHECK_TTL: 300000,            // 健康检查缓存5分钟
  KEY_METRICS_TTL: 600000,             // KEY指标缓存10分钟
  MAX_CACHE_SIZE: 1000,                // 最大缓存条目数
  MAX_MEMORY_USAGE: 50 * 1024 * 1024,  // 最大内存使用50MB
  CLEANUP_INTERVAL: 300000,            // 清理间隔5分钟
} as const;

// 认证配置
export const AUTH_CONFIG = {
  ENABLE_API_KEY_VALIDATION: true,
  MAX_API_KEY_LENGTH: 200,
  MIN_API_KEY_LENGTH: 10, // 降低最小长度以提高兼容性
  ENABLE_INPUT_SANITIZATION: true,
  ALLOWED_ORIGINS: ['*'],
  ENABLE_CORS_PROTECTION: false,
} as const;

// 日志配置
export const LOGGER_CONFIG = {
  LEVEL: 'info',
  ENABLE_CONSOLE: true,
  ENABLE_DATABASE: true,
  MAX_LOG_SIZE: 10000,
  BATCH_SIZE: 100,
  FLUSH_INTERVAL: 10000, // 10秒
} as const;

// HTTP配置
export const HTTP_CONFIG = {
  TIMEOUT: 30000,
  MAX_RETRIES: 3,
  INITIAL_RETRY_DELAY: 1000,
  MAX_RETRY_DELAY: 10000,
  BACKOFF_MULTIPLIER: 2,
  RETRYABLE_STATUS_CODES: [408, 429, 500, 502, 503, 504],
  RETRYABLE_ERRORS: ['NETWORK_ERROR', 'TIMEOUT', 'CONNECTION_RESET'],
} as const;

// 系统限制
export const SYSTEM_LIMITS = {
  MAX_REQUEST_SIZE: 10 * 1024 * 1024,  // 10MB
  MAX_RESPONSE_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_CONCURRENT_REQUESTS: 100,
  REQUEST_TIMEOUT: 300000, // 5分钟
} as const;

// 错误消息模板
export const ERROR_MESSAGES = {
  NO_API_KEY: 'API key is required. Please provide a valid Gemini API key.',
  INVALID_API_KEY: 'Invalid API key format. Please check your Gemini API key.',
  UNSUPPORTED_MODEL: 'Model not supported. Please use a supported model.',
  RATE_LIMITED: 'Rate limit exceeded. Please try again later.',
  INTERNAL_ERROR: 'Internal server error. Please try again.',
  TIMEOUT: 'Request timeout. Please try again.',
  INVALID_REQUEST: 'Invalid request format. Please check your request.',
} as const;