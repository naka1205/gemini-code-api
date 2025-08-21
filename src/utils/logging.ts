// src/utils/logging.ts
import { getDb } from './db';
import { requestLogs } from './db/schema';
import { createHash, randomUUID } from 'node:crypto';
// 兼容移除 h3 依赖：定义最小事件类型以满足日志读取需求
export type H3Event = {
  node?: {
    req?: {
      url?: string;
      headers?: Record<string, string | undefined>;
      socket?: { remoteAddress?: string };
    }
  }
};
import type { Context } from 'hono';

export interface LogData {
  apiKey: string;
  model: string;
  statusCode: number;
  responseTime: number;
  isStream?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
}

export interface LogOptions {
  isStream?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  requestModel?: string;
}

export interface ErrorLogOptions extends LogOptions {
  statusCode: number;
  message: string;
}

export class LoggingService {
  constructor(private db?: any) {}

  async logRequest(event: H3Event, logData: LogData): Promise<void> {
    try {
      const database = getDb(this.db);
      
      const entry = {
        id: randomUUID(),
        apiKeyHash: createHash('sha256').update(logData.apiKey).digest('hex'),
        model: logData.model,
        ipAddress: this.getClientIP(event),
        statusCode: logData.statusCode,
        requestTimestamp: new Date().toISOString(),
        responseTimeMs: logData.responseTime,
        isStream: logData.isStream || false,
        userAgent: this.getHeader(event, 'user-agent') || '',
        errorMessage: logData.errorMessage || null,
        requestUrl: this.extractPathFromUrl(event.node?.req?.url || ''),
        requestModel: logData.model,
        inputTokens: logData.inputTokens || null,
        outputTokens: logData.outputTokens || null,
      };

      await database.insert(requestLogs).values(entry).execute();
    } catch (error) {
      console.error('Failed to log request:', error);
      // Don't throw error to avoid breaking the main request flow
    }
  }

  async logSuccess(
    eventOrContext: H3Event | Context | any, 
    apiKey: string, 
    model: string, 
    responseTime: number, 
    options: LogOptions = {}
  ): Promise<void> {
    try {
      // Handle both H3Event and Hono Context
      let db: any;
      let ipAddress: string;
      let userAgent: string;
      let requestUrl: string;

      if (eventOrContext.env) {
        // Hono Context
        db = eventOrContext.env.DB;
        ipAddress = this.getClientIPFromContext(eventOrContext);
        userAgent = eventOrContext.req?.header?.('user-agent') || '';
        requestUrl = this.extractPathFromUrl(eventOrContext.req?.url || '');
      } else {
        // H3Event or mock event
        db = eventOrContext.context?.cloudflare?.env?.DB || this.db;
        ipAddress = this.getClientIP(eventOrContext);
        userAgent = this.getHeader(eventOrContext, 'user-agent') || '';
        requestUrl = this.extractPathFromUrl(eventOrContext.node?.req?.url || '');
      }

      if (!db) {
        console.warn('Database not available for logging');
        return;
      }

      const database = getDb(db);
      
      const entry = {
        id: randomUUID(),
        apiKeyHash: createHash('sha256').update(apiKey).digest('hex'),
        model: model,
        ipAddress,
        statusCode: 200,
        requestTimestamp: new Date().toISOString(),
        responseTimeMs: responseTime,
        isStream: options.isStream || false,
        userAgent,
        errorMessage: null,
        requestUrl,
        requestModel: options.requestModel || model,
        inputTokens: options.inputTokens || null,
        outputTokens: options.outputTokens || null,
      };

      await database.insert(requestLogs).values(entry).execute();
    } catch (error) {
      console.error('Failed to log success:', error);
      // Don't throw error to avoid breaking the main request flow
    }
  }

  async logError(
    eventOrContext: H3Event | Context | any, 
    apiKey: string, 
    model: string, 
    responseTime: number, 
    options: ErrorLogOptions
  ): Promise<void> {
    try {
      // Handle both H3Event and Hono Context
      let db: any;
      let ipAddress: string;
      let userAgent: string;
      let requestUrl: string;

      if (eventOrContext.env) {
        // Hono Context
        db = eventOrContext.env.DB;
        ipAddress = this.getClientIPFromContext(eventOrContext);
        userAgent = eventOrContext.req?.header?.('user-agent') || '';
        requestUrl = this.extractPathFromUrl(eventOrContext.req?.url || '');
      } else {
        // H3Event or mock event
        db = eventOrContext.context?.cloudflare?.env?.DB || this.db;
        ipAddress = this.getClientIP(eventOrContext);
        userAgent = this.getHeader(eventOrContext, 'user-agent') || '';
        requestUrl = this.extractPathFromUrl(eventOrContext.node?.req?.url || '');
      }

      if (!db) {
        console.warn('Database not available for logging');
        return;
      }

      const database = getDb(db);
      
      const entry = {
        id: randomUUID(),
        apiKeyHash: createHash('sha256').update(apiKey).digest('hex'),
        model: model,
        ipAddress,
        statusCode: options.statusCode,
        requestTimestamp: new Date().toISOString(),
        responseTimeMs: responseTime,
        isStream: options.isStream || false,
        userAgent,
        errorMessage: options.message,
        requestUrl,
        requestModel: options.requestModel || model,
        inputTokens: options.inputTokens || null,
        outputTokens: options.outputTokens || null,
      };

      await database.insert(requestLogs).values(entry).execute();
    } catch (error) {
      console.error('Failed to log error:', error);
      // Don't throw error to avoid breaking the main request flow
    }
  }

  private getClientIPFromContext(c: Context): string {
    // Cloudflare Workers 环境下的IP获取优先级
    const cfConnectingIP = c.req.header('cf-connecting-ip');
    if (cfConnectingIP) {
      return cfConnectingIP;
    }

    const cfRay = c.req.header('cf-ray');
    if (cfRay) {
      // 如果有CF-Ray头，说明请求经过了Cloudflare
      const cfIP = c.req.header('x-forwarded-for');
      if (cfIP) {
        return cfIP.split(',')[0].trim();
      }
    }

    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }

    const realIP = c.req.header('x-real-ip');
    if (realIP) {
      return realIP;
    }

    // 尝试从请求对象中获取IP
    const req = c.req as any;
    if (req?.raw?.cf?.connectingIP) {
      return req.raw.cf.connectingIP;
    }

    return 'unknown';
  }

  private getClientIP(event: H3Event): string {
    const forwarded = this.getHeader(event, 'x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    
    const realIP = this.getHeader(event, 'x-real-ip');
    if (realIP) {
      return realIP;
    }
    
    const cfConnectingIP = this.getHeader(event, 'cf-connecting-ip');
    if (cfConnectingIP) {
      return cfConnectingIP;
    }
    
    return event.node?.req?.socket?.remoteAddress || 'unknown';
  }

  private getHeader(event: H3Event, name: string): string | undefined {
    return event.node?.req?.headers?.[name] as string | undefined;
  }

  private extractPathFromUrl(url: string): string {
    try {
      if (!url) return '';
      const urlObj = new URL(url);
      return urlObj.pathname + urlObj.search;
    } catch {
      // 如果URL解析失败，尝试直接提取路径部分
      const pathMatch = url.match(/^https?:\/\/[^\/]+(\/.*)$/);
      return pathMatch ? pathMatch[1] : url;
    }
  }
}