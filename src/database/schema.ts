/**
 * 数据库表结构定义
 * 纯代理模式 - 不存储敏感API KEY信息
 */
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

// 请求日志表 - 核心功能
export const requestLogs = sqliteTable('request_logs', {
  id: text('id').primaryKey(), // UUID格式请求ID
  timestamp: integer('timestamp').notNull(), // Unix时间戳（毫秒）
  
  // 请求基本信息
  clientType: text('client_type', { enum: ['openai', 'claude', 'gemini', 'unknown'] }).notNull(),
  clientIP: text('client_ip').notNull(),
  userAgent: text('user_agent'),
  
  // API信息（不存储原始KEY）
  apiKeyHash: text('api_key_hash').notNull(), // SHA256哈希，不可逆
  model: text('model').notNull(),
  originalModel: text('original_model'), // 客户端原始请求的模型
  endpoint: text('endpoint').notNull(),
  
  // 性能指标
  responseTime: integer('response_time').notNull(), // 响应时间（毫秒）
  statusCode: integer('status_code').notNull(),
  
  // Token使用情况
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  totalTokens: integer('total_tokens'),
  
  // 请求特征
  isStream: integer('is_stream', { mode: 'boolean' }).default(false),
  hasError: integer('has_error', { mode: 'boolean' }).default(false),
  errorMessage: text('error_message'),
  
  // 请求大小信息
  requestSize: integer('request_size'), // 请求体大小（字节）
  responseSize: integer('response_size'), // 响应体大小（字节）
}, (table) => ({
  // 索引优化查询性能
  timestampIdx: index('idx_request_logs_timestamp').on(table.timestamp),
  clientTypeIdx: index('idx_request_logs_client_type').on(table.clientType),
  apiKeyHashIdx: index('idx_request_logs_api_key_hash').on(table.apiKeyHash),
  modelIdx: index('idx_request_logs_model').on(table.model),
  statusCodeIdx: index('idx_request_logs_status_code').on(table.statusCode),
  errorIdx: index('idx_request_logs_has_error').on(table.hasError),
}));

// API密钥性能统计表（仅存储哈希，不存储原始KEY）
export const apiKeyMetrics = sqliteTable('api_key_metrics', {
  keyHash: text('key_hash').primaryKey(), // SHA256哈希
  
  // 统计指标
  totalRequests: integer('total_requests').default(0),
  successfulRequests: integer('successful_requests').default(0),
  failedRequests: integer('failed_requests').default(0),
  
  // 性能指标
  averageResponseTime: real('average_response_time').default(0),
  lastResponseTime: integer('last_response_time'),
  minResponseTime: integer('min_response_time'),
  maxResponseTime: integer('max_response_time'),
  
  // 健康状态
  isHealthy: integer('is_healthy', { mode: 'boolean' }).default(true),
  lastHealthCheck: integer('last_health_check'),
  consecutiveFailures: integer('consecutive_failures').default(0),
  lastFailureTime: integer('last_failure_time'),
  
  // 使用统计
  totalTokens: integer('total_tokens').default(0),
  totalInputTokens: integer('total_input_tokens').default(0),
  totalOutputTokens: integer('total_output_tokens').default(0),
  lastUsed: integer('last_used'),
  firstSeen: integer('first_seen'),
  
  // 更新时间
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => ({
  // 索引
  healthyIdx: index('idx_api_key_metrics_healthy').on(table.isHealthy),
  lastUsedIdx: index('idx_api_key_metrics_last_used').on(table.lastUsed),
  performanceIdx: index('idx_api_key_metrics_performance').on(table.averageResponseTime, table.successfulRequests),
}));

// 系统统计表 - 每日汇总数据
export const systemStats = sqliteTable('system_stats', {
  date: text('date').primaryKey(), // YYYY-MM-DD格式
  
  // 每日请求统计
  totalRequests: integer('total_requests').default(0),
  successfulRequests: integer('successful_requests').default(0),
  failedRequests: integer('failed_requests').default(0),
  
  // 客户端类型分布
  openaiRequests: integer('openai_requests').default(0),
  claudeRequests: integer('claude_requests').default(0),
  geminiRequests: integer('gemini_requests').default(0),
  unknownRequests: integer('unknown_requests').default(0),
  
  // Token使用统计
  totalTokensUsed: integer('total_tokens_used').default(0),
  totalInputTokens: integer('total_input_tokens').default(0),
  totalOutputTokens: integer('total_output_tokens').default(0),
  
  // 性能统计
  averageResponseTime: real('average_response_time').default(0),
  minResponseTime: integer('min_response_time'),
  maxResponseTime: integer('max_response_time'),
  
  // 错误统计
  errorRate: real('error_rate').default(0),
  timeoutCount: integer('timeout_count').default(0),
  rateLimitCount: integer('rate_limit_count').default(0),
  authErrorCount: integer('auth_error_count').default(0),
  
  // 流量统计
  totalRequestSize: integer('total_request_size').default(0), // 字节
  totalResponseSize: integer('total_response_size').default(0), // 字节
  streamRequestCount: integer('stream_request_count').default(0),
  
  // API密钥统计
  uniqueApiKeys: integer('unique_api_keys').default(0),
  activeApiKeys: integer('active_api_keys').default(0), // 当日活跃的KEY数量
  
  // 更新时间
  updatedAt: integer('updated_at').notNull(),
}, (table) => ({
  // 索引
  dateIdx: index('idx_system_stats_date').on(table.date),
}));

// 错误日志表 - 详细错误信息
export const errorLogs = sqliteTable('error_logs', {
  id: text('id').primaryKey(),
  timestamp: integer('timestamp').notNull(),
  
  // 错误信息
  errorType: text('error_type').notNull(),
  errorMessage: text('error_message').notNull(),
  errorStack: text('error_stack'),
  
  // 请求上下文
  requestId: text('request_id'),
  clientType: text('client_type'),
  clientIP: text('client_ip'),
  endpoint: text('endpoint'),
  method: text('method'),
  
  // API密钥信息（仅哈希）
  apiKeyHash: text('api_key_hash'),
  
  // HTTP信息
  statusCode: integer('status_code'),
  userAgent: text('user_agent'),
  referer: text('referer'),
  
  // 额外上下文
  context: text('context'), // JSON格式的额外信息
  
  // 创建时间
  createdAt: integer('created_at').notNull(),
}, (table) => ({
  // 索引
  timestampIdx: index('idx_error_logs_timestamp').on(table.timestamp),
  errorTypeIdx: index('idx_error_logs_error_type').on(table.errorType),
  requestIdIdx: index('idx_error_logs_request_id').on(table.requestId),
}));

// 导出表类型（用于TypeScript类型推断）
export type RequestLog = typeof requestLogs.$inferSelect;
export type NewRequestLog = typeof requestLogs.$inferInsert;

export type ApiKeyMetric = typeof apiKeyMetrics.$inferSelect;
export type NewApiKeyMetric = typeof apiKeyMetrics.$inferInsert;

export type SystemStat = typeof systemStats.$inferSelect;
export type NewSystemStat = typeof systemStats.$inferInsert;

export type ErrorLog = typeof errorLogs.$inferSelect;
export type NewErrorLog = typeof errorLogs.$inferInsert;