/**
 * 服务层相关类型定义
 * 负载均衡、缓存、日志服务类型
 */
import type { ClientType, Status } from './common.js';

// 负载均衡配置
export interface LoadBalancerConfig {
  maxConsecutiveErrors: number;
  performanceWindow: number; // 性能评估窗口（毫秒）
  responseTimeWeight: number; // 响应时间权重
  successRateWeight: number; // 成功率权重
  minRequestsForStats: number; // 统计最小请求数
  unhealthyThreshold: number; // 不健康阈值
  recoveryCheckInterval: number; // 恢复检查间隔
}

// API密钥性能指标（内存中临时存储）
export interface KeyPerformanceMetrics {
  keyHash: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  lastResponseTime: number;
  consecutiveFailures: number;
  isHealthy: boolean;
  lastUsed: number;
  firstSeen: number;
}

// 负载均衡选择结果
export interface LoadBalancerResult {
  selectedKey: string;
  selectedKeyHash: string;
  reason: string;
  availableKeys: number;
  healthyKeys: number;
}

// 缓存配置
export interface CacheConfig {
  maxSize: number;
  defaultTTL: number; // 默认过期时间（毫秒）
  cleanupInterval: number; // 清理间隔（毫秒）
  maxMemoryUsage: number; // 最大内存使用（字节）
}

// 缓存项
export interface CacheItem<T = any> {
  key: string;
  value: T;
  expiresAt: number;
  createdAt: number;
  accessCount: number;
  lastAccessed: number;
  size: number; // 字节大小
}

// 缓存统计
export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  memoryUsage: number;
  hitRate: number;
}

// 日志配置
export interface LoggerConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  enableConsole: boolean;
  enableDatabase: boolean;
  maxLogSize: number;
  batchSize: number;
  flushInterval: number;
}

// 日志条目
export interface LogEntry {
  id: string;
  timestamp: number;
  level: string;
  message: string;
  context?: Record<string, any>;
  requestId?: string;
  clientType?: ClientType;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

// 服务健康状态
export interface ServiceHealth {
  service: string;
  status: Status;
  message?: string;
  lastCheck: number;
  responseTime?: number;
  dependencies?: ServiceHealth[];
}

// 性能监控指标
export interface PerformanceMetrics {
  requestCount: number;
  averageResponseTime: number;
  errorRate: number;
  throughput: number; // 请求/秒
  memoryUsage: number;
  cpuUsage?: number;
  uptime: number;
}

// 健康检查结果
export interface HealthCheckResult {
  keyHash: string;
  isHealthy: boolean;
  lastChecked: number;
  responseTime?: number;
  reason: string;
  statusCode?: number;
  error?: string;
}

// 负载均衡器统计信息
export interface LoadBalancerStats {
  totalKeys: number;
  healthyKeys: number;
  unhealthyKeys: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  lastCleanup: number;
}

// 服务配置
export interface ServiceConfig {
  loadBalancer: LoadBalancerConfig;
  cache: CacheConfig;
  logger: LoggerConfig;
  enableMetrics: boolean;
  metricsInterval: number;
}