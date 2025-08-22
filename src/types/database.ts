/**
 * 数据库相关类型定义
 * 纯代理模式数据库结构（不存储敏感KEY信息）
 */
import type { ClientType } from './common.js';

// 请求日志记录
export interface RequestLog {
  id: string;
  timestamp: number;
  
  // 请求信息
  clientType: ClientType;
  clientIP: string;
  userAgent?: string;
  
  // API信息（不存储原始KEY）
  apiKeyHash: string; // SHA256哈希，不可逆
  model: string;
  endpoint: string;
  
  // 性能指标
  responseTime: number; // 毫秒
  statusCode: number;
  
  // Token使用情况
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  
  // 请求特征
  isStream: boolean;
  hasError: boolean;
  errorMessage?: string;
}

// API密钥性能指标（仅哈希，不存储原始KEY）
export interface ApiKeyMetric {
  keyHash: string; // SHA256哈希
  
  // 统计指标
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  
  // 性能指标
  averageResponseTime: number;
  lastResponseTime?: number;
  
  // 健康状态
  isHealthy: boolean;
  lastHealthCheck?: number;
  consecutiveFailures: number;
  
  // 使用统计
  totalTokens: number;
  lastUsed?: number;
  
  // 更新时间
  updatedAt: number;
}

// 系统统计
export interface SystemStat {
  date: string; // YYYY-MM-DD格式
  
  // 每日统计
  totalRequests: number;
  successfulRequests: number;
  
  // 客户端类型分布
  openaiRequests: number;
  claudeRequests: number;
  geminiRequests: number;
  
  // Token使用统计
  totalTokensUsed: number;
  
  // 性能统计
  averageResponseTime: number;
  
  // 更新时间
  updatedAt: number;
}

// 数据库操作结果
export interface DatabaseResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  rowsAffected?: number;
}

// 查询选项
export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
  filters?: Record<string, any>;
}

// 数据库连接接口
export interface DatabaseConnection {
  prepare(sql: string): any;
  batch(statements: any[]): Promise<any[]>;
  exec(sql: string): Promise<any>;
}