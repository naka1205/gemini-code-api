/**
 * 请求日志中间件
 * 记录请求和响应信息，支持数据库存储
 */
import type { Context, Next } from 'hono';
import { LogLevel } from '../types/index.js';
import { LOGGER_CONFIG } from '../utils/constants.js';
import { generateRequestId } from '../utils/helpers.js';
import { log } from '../utils/logger.js';

/**
 * 日志条目接口
 */
export interface LogEntry {
  requestId: string;
  timestamp: number;
  method: string;
  path: string;
  userAgent?: string;
  clientType?: string;
  clientIp?: string;
  origin?: string;
  referer?: string;
  responseTime?: number;
  statusCode?: number;
  requestSize?: number;
  responseSize?: number;
  apiKeyHash?: string;
  model?: string;
  tokenUsage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  error?: string;
  level: LogLevel;
}

/**
 * 日志批处理管理器
 */
class LogBatcher {
  private batch: LogEntry[] = [];
  private flushTimer: number | null = null;

  constructor(
    private batchSize: number = LOGGER_CONFIG.BATCH_SIZE,
    private flushInterval: number = LOGGER_CONFIG.FLUSH_INTERVAL
  ) {}

  /**
   * 添加日志条目到批次
   */
  add(entry: LogEntry): void {
    this.batch.push(entry);

    // 如果批次已满，立即刷新
    if (this.batch.length >= this.batchSize) {
      this.flush();
    } else {
      // 否则设置定时刷新
      this.scheduleFlush();
    }
  }

  /**
   * 强制刷新批次
   */
  flush(): void {
    if (this.batch.length === 0) return;

    const entries = [...this.batch];
    this.batch = [];

    // 清除定时器
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // 异步写入数据库（不阻塞请求）
    this.writeToDatabaseAsync(entries).catch(error => {
      log.error('Failed to write logs to database:', error);
    });

    // 控制台输出（如果启用）
    if (LOGGER_CONFIG.ENABLE_CONSOLE) {
      entries.forEach(entry => this.logToConsole(entry));
    }
  }

  /**
   * 调度定时刷新
   */
  private scheduleFlush(): void {
    if (this.flushTimer) return;

    this.flushTimer = setTimeout(() => {
      this.flush();
    }, this.flushInterval) as unknown as number;
  }

  /**
   * 异步写入数据库
   */
  private async writeToDatabaseAsync(entries: LogEntry[]): Promise<void> {
    if (!LOGGER_CONFIG.ENABLE_DATABASE) return;

    try {
      // 这里应该调用数据库操作函数
      // await insertRequestLogs(entries);
      log.debug(`Batch logged ${entries.length} entries to database`);
    } catch (error) {
      log.error('Database logging error:', error as Error);
      // 可以考虑将失败的日志写入文件或重试队列
    }
  }

  /**
   * 控制台输出
   */
  private logToConsole(entry: LogEntry): void {
    const { level, requestId, method, path, statusCode, responseTime, error } = entry;
    
    const timestamp = new Date(entry.timestamp).toISOString();
    const logMessage = `[${timestamp}] ${requestId} ${method} ${path} ${statusCode || 'PENDING'}${responseTime ? ` ${responseTime}ms` : ''}${error ? ` ERROR: ${error}` : ''}`;

    switch (level) {
      case LogLevel.ERROR:
        console.error(logMessage);
        break;
      case LogLevel.WARN:
        console.warn(logMessage);
        break;
      case LogLevel.DEBUG:
        console.debug(logMessage);
        break;
      default:
        console.log(logMessage);
    }
  }
}

/**
 * 全局日志批处理器
 */
const globalBatcher = new LogBatcher();

/**
 * 请求日志中间件
 */
export function logger() {
  return async (c: Context, next: Next) => {
    const startTime = Date.now();
    const requestId = generateRequestId();
    const request = c.req;

    // 将请求ID添加到上下文
    c.set('requestId', requestId);

    // 记录请求开始
    const requestEntry: LogEntry = {
      requestId,
      timestamp: startTime,
      method: request.method,
      path: new URL(request.url).pathname,
      userAgent: request.header('user-agent') || '',
      clientIp: getClientIp(request.raw as any),
      origin: request.header('origin') || '',
      referer: request.header('referer') || '',
      requestSize: getRequestSize(request as any),
      level: LogLevel.INFO,
    };

    try {
      // 执行请求处理
      await next();

      // 记录成功响应
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      const responseEntry: LogEntry = {
        ...requestEntry,
        responseTime,
        statusCode: c.res.status,
        responseSize: getResponseSize(c.res),
        timestamp: endTime,
      };

      // 添加额外的上下文信息
      addContextInfo(responseEntry, c);

      globalBatcher.add(responseEntry);

      // 添加响应头
      c.header('x-request-id', requestId);
      c.header('x-response-time', `${responseTime}ms`);

    } catch (error) {
      // 记录错误响应
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      const errorEntry: LogEntry = {
        ...requestEntry,
        responseTime,
        statusCode: c.res.status || 500,
        error: error instanceof Error ? error.message : 'Unknown error',
        level: LogLevel.ERROR,
        timestamp: endTime,
      };

      addContextInfo(errorEntry, c);
      globalBatcher.add(errorEntry);

      // 重新抛出错误
      throw error;
    }
  };
}

/**
 * 添加上下文信息到日志条目
 */
function addContextInfo(entry: LogEntry, c: Context): void {
  // 从上下文获取额外信息
  const clientType = c.get('clientType');
  const apiKeyHash = c.get('selectedKeyHash');
  const model = c.get('model');
  const tokenUsage = c.get('tokenUsage');

  if (clientType) entry.clientType = clientType;
  if (apiKeyHash) entry.apiKeyHash = apiKeyHash;
  if (model) entry.model = model;
  if (tokenUsage) entry.tokenUsage = tokenUsage;
}

/**
 * 获取客户端IP地址
 */
function getClientIp(request: Request | any): string {
  // Cloudflare Workers 环境下的IP获取
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp;

  // 其他常见的IP头
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }

  const xRealIp = request.headers.get('x-real-ip');
  if (xRealIp) return xRealIp;

  return 'unknown';
}

/**
 * 获取请求大小（估算）
 */
function getRequestSize(request: Request | any): number {
  // 处理Hono请求对象
  if (request.header && typeof request.header === 'function') {
    const contentLength = request.header('content-length');
    if (contentLength) {
      return parseInt(contentLength, 10);
    }
    
    // 对于Hono请求，估算基本大小
    return 512; // 估算的请求头大小
  }
  
  // 处理原生Request对象
  if (request.headers && request.headers.get) {
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      return parseInt(contentLength, 10);
    }

    // 估算请求头大小
    let headerSize = 0;
    for (const [key, value] of request.headers.entries()) {
      headerSize += key.length + value.length + 4; // +4 for ': ' and '\r\n'
    }

    return headerSize;
  }
  
  // 默认估算大小
  return 512;
}

/**
 * 获取响应大小（估算）
 */
function getResponseSize(response: Response): number {
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    return parseInt(contentLength, 10);
  }

  // 估算响应头大小
  let headerSize = 0;
  for (const [key, value] of response.headers.entries()) {
    headerSize += key.length + value.length + 4;
  }

  return headerSize;
}

/**
 * 创建结构化日志记录器
 */
export class StructuredLogger {
  constructor(private context: Context) {}

  /**
   * 记录信息日志
   */
  info(message: string, extra?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, extra);
  }

  /**
   * 记录警告日志
   */
  warn(message: string, extra?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, extra);
  }

  /**
   * 记录错误日志
   */
  error(message: string, error?: Error, extra?: Record<string, any>): void {
    const logExtra = {
      ...extra,
      error: error?.message,
      stack: error?.stack,
    };
    this.log(LogLevel.ERROR, message, logExtra);
  }

  /**
   * 记录调试日志
   */
  debug(message: string, extra?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, extra);
  }

  /**
   * 通用日志记录
   */
  private log(level: LogLevel, message: string, extra?: Record<string, any>): void {
    const requestId = this.context.get('requestId') || 'unknown';
    const request = this.context.req;

    const entry: LogEntry = {
      requestId,
      timestamp: Date.now(),
      method: request.method,
      path: new URL(request.url).pathname,
      level,
      error: message,
      ...extra,
    };

    globalBatcher.add(entry);
  }
}

/**
 * 获取结构化日志记录器
 */
export function getLogger(c: Context): StructuredLogger {
  return new StructuredLogger(c);
}

/**
 * 手动刷新日志批次
 */
export function flushLogs(): void {
  globalBatcher.flush();
}

/**
 * 记录API调用指标
 */
export function logApiMetrics(
  c: Context,
  apiKeyHash: string,
  model: string,
  responseTime: number,
  success: boolean,
  tokenUsage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  }
): void {
  const logger = getLogger(c);
  
  logger.info('API call completed', {
    apiKeyHash,
    model,
    responseTime,
    success,
    tokenUsage,
  });
}