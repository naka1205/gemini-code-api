// src/api/middleware/logger.ts
import { Context, Next } from 'hono';
import { getGlobalLogger } from '../../base/logging/logger';

export interface RequestLogConfig {
  enabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logRequestBody: boolean;
  logResponseBody: boolean;
  maxBodyLength: number;
  sensitiveHeaders: string[];
  sensitiveBodyFields: string[];
  skipPaths: string[];
  skipMethods: string[];
  includePerformanceMetrics: boolean;
}

export const DEFAULT_REQUEST_LOG_CONFIG: RequestLogConfig = {
  enabled: true,
  logLevel: 'info',
  logRequestBody: false,
  logResponseBody: false,
  maxBodyLength: 1000,
  sensitiveHeaders: [
    'authorization',
    'cookie',
    'x-api-key',
    'x-goog-api-key',
    'x-auth-token'
  ],
  sensitiveBodyFields: [
    'password',
    'token',
    'secret',
    'key',
    'apikey',
    'api_key'
  ],
  skipPaths: ['/health', '/ping', '/favicon.ico'],
  skipMethods: ['OPTIONS'],
  includePerformanceMetrics: true
};

export interface RequestContext {
  requestId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  method: string;
  url: string;
  path: string;
  userAgent: string | undefined;
  clientIp: string | undefined;
  statusCode?: number;
  requestSize?: number;
  responseSize?: number;
  error?: Error;
}

export function requestLoggerMiddleware(config: Partial<RequestLogConfig> = {}) {
  const logConfig: RequestLogConfig = { ...DEFAULT_REQUEST_LOG_CONFIG, ...config };

  return async (c: Context, next: Next) => {
    if (!logConfig.enabled) {
      await next();
      return;
    }

    const requestContext: RequestContext = {
      requestId: generateRequestId(),
      startTime: Date.now(),
      method: c.req.method,
      url: c.req.url,
      path: c.req.path,
      userAgent: c.req.header('user-agent'),
      clientIp: getClientIp(c)
    };

    // Skip logging for specified paths and methods
    if (shouldSkipLogging(requestContext, logConfig)) {
      await next();
      return;
    }

    // Set request ID in context for downstream middleware
    c.set('requestId', requestContext.requestId);

    // Log request start
    await logRequest(requestContext, c, logConfig);

    let responseBody: string | undefined;
    let originalResponse: Response | undefined;

    try {
      await next();
      
      requestContext.endTime = Date.now();
      requestContext.duration = requestContext.endTime - requestContext.startTime;
      requestContext.statusCode = c.res.status;

      // Capture response for logging if needed
      if (logConfig.logResponseBody && c.res.body) {
        try {
          originalResponse = c.res.clone();
          responseBody = await originalResponse.text();
        } catch (error) {
          // Ignore response body capture errors
        }
      }

    } catch (error) {
      requestContext.endTime = Date.now();
      requestContext.duration = requestContext.endTime - requestContext.startTime;
      requestContext.error = error instanceof Error ? error : new Error(String(error));
      requestContext.statusCode = 500; // Default to 500 for unhandled errors
      
      // Re-throw the error after logging
      await logResponse(requestContext, responseBody, logConfig);
      throw error;
    }

    // Log successful response
    await logResponse(requestContext, responseBody, logConfig);
  };
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Extract client IP address
 */
function getClientIp(c: Context): string | undefined {
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    c.req.header('x-client-ip') ||
    undefined
  );
}

/**
 * Check if request should be skipped from logging
 */
function shouldSkipLogging(context: RequestContext, config: RequestLogConfig): boolean {
  if (config.skipMethods.includes(context.method)) {
    return true;
  }
  
  return config.skipPaths.some(path => {
    if (path.endsWith('*')) {
      return context.path.startsWith(path.slice(0, -1));
    }
    return context.path === path;
  });
}

/**
 * Log the incoming request
 */
async function logRequest(context: RequestContext, c: Context, config: RequestLogConfig): Promise<void> {
  const logger = getGlobalLogger();
  
  const logData: any = {
    requestId: context.requestId,
    method: context.method,
    path: context.path,
    url: context.url,
    userAgent: context.userAgent,
    clientIp: context.clientIp,
    headers: maskSensitiveData(getHeaders(c), config.sensitiveHeaders)
  };

  // Add request body if configured
  if (config.logRequestBody) {
    try {
      const requestBody = await c.req.text();
      if (requestBody) {
        const truncatedBody = requestBody.length > config.maxBodyLength
          ? requestBody.substring(0, config.maxBodyLength) + '... (truncated)'
          : requestBody;
        
        logData.requestBody = maskSensitiveBodyFields(truncatedBody, config.sensitiveBodyFields);
        logData.requestSize = requestBody.length;
        
        // Need to recreate the request since we consumed the body
        // Note: Cannot reassign to c.req as it's read-only
        // This is a limitation we'll need to work around
      }
    } catch (error) {
      logData.requestBodyError = 'Failed to read request body';
    }
  }

  const message = `→ ${context.method} ${context.path}`;
  
  switch (config.logLevel) {
    case 'debug':
      logger.debug(message, logData);
      break;
    case 'info':
      logger.info(message, logData);
      break;
    case 'warn':
      logger.warn(message, logData);
      break;
    case 'error':
      logger.error(message, undefined, logData);
      break;
  }
}

/**
 * Log the response
 */
async function logResponse(context: RequestContext, responseBody: string | undefined, config: RequestLogConfig): Promise<void> {
  const logger = getGlobalLogger();
  
  const logData: any = {
    requestId: context.requestId,
    method: context.method,
    path: context.path,
    statusCode: context.statusCode,
    duration: context.duration
  };

  if (config.includePerformanceMetrics) {
    logData.performance = {
      duration: context.duration,
      timestamp: context.endTime
    };
  }

  // Add response body if configured and available
  if (config.logResponseBody && responseBody) {
    const truncatedBody = responseBody.length > config.maxBodyLength
      ? responseBody.substring(0, config.maxBodyLength) + '... (truncated)'
      : responseBody;
    
    logData.responseBody = maskSensitiveBodyFields(truncatedBody, config.sensitiveBodyFields);
    logData.responseSize = responseBody.length;
  }

  // Add error details if present
  if (context.error) {
    logData.error = {
      name: context.error.name,
      message: context.error.message,
      stack: context.error.stack
    };
  }

  const statusEmoji = getStatusEmoji(context.statusCode || 500);
  const message = `← ${context.method} ${context.path} ${statusEmoji} ${context.statusCode} (${context.duration}ms)`;
  
  // Choose log level based on status code and errors
  if (context.error || (context.statusCode && context.statusCode >= 500)) {
    logger.error(message, context.error, logData);
  } else if (context.statusCode && context.statusCode >= 400) {
    logger.warn(message, logData);
  } else {
    switch (config.logLevel) {
      case 'debug':
        logger.debug(message, logData);
        break;
      case 'info':
        logger.info(message, logData);
        break;
      case 'warn':
        logger.warn(message, logData);
        break;
      case 'error':
        logger.error(message, undefined, logData);
        break;
    }
  }
}

/**
 * Get status code emoji for visual indication
 */
function getStatusEmoji(statusCode: number): string {
  if (statusCode >= 200 && statusCode < 300) return '✅';
  if (statusCode >= 300 && statusCode < 400) return '↩️';
  if (statusCode >= 400 && statusCode < 500) return '❌';
  if (statusCode >= 500) return '💥';
  return '❓';
}

/**
 * Extract headers from request context
 */
function getHeaders(c: Context): Record<string, string> {
  const headers: Record<string, string> = {};
  
  // Hono doesn't provide a direct way to get all headers
  // We'll capture the most common ones
  const commonHeaders = [
    'authorization',
    'content-type',
    'user-agent',
    'accept',
    'origin',
    'referer',
    'x-api-key',
    'x-goog-api-key',
    'x-forwarded-for',
    'cf-connecting-ip'
  ];

  for (const header of commonHeaders) {
    const value = c.req.header(header);
    if (value) {
      headers[header] = value;
    }
  }

  return headers;
}

/**
 * Mask sensitive data in headers and objects
 */
function maskSensitiveData(data: any, sensitiveFields: string[]): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const masked = { ...data };
  
  for (const field of sensitiveFields) {
    if (masked[field]) {
      masked[field] = '***MASKED***';
    }
    if (masked[field.toLowerCase()]) {
      masked[field.toLowerCase()] = '***MASKED***';
    }
  }

  return masked;
}

/**
 * Mask sensitive fields in request/response body
 */
function maskSensitiveBodyFields(body: string, sensitiveFields: string[]): string {
  if (!body || typeof body !== 'string') {
    return body;
  }

  let maskedBody = body;
  
  // Try to parse as JSON and mask fields
  try {
    const parsed = JSON.parse(body);
    const masked = maskSensitiveData(parsed, sensitiveFields);
    maskedBody = JSON.stringify(masked);
  } catch {
    // If not JSON, use regex to mask common patterns
    for (const field of sensitiveFields) {
      const regex = new RegExp(`"${field}"\\s*:\\s*"[^"]*"`, 'gi');
      maskedBody = maskedBody.replace(regex, `"${field}": "***MASKED***"`);
    }
  }

  return maskedBody;
}

/**
 * Create request logger middleware with presets
 */
export const createLoggerPresets = {
  /**
   * Detailed logging - verbose with request/response bodies
   */
  detailed(): ReturnType<typeof requestLoggerMiddleware> {
    return requestLoggerMiddleware({
      logLevel: 'debug',
      logRequestBody: true,
      logResponseBody: true,
      maxBodyLength: 2000,
      includePerformanceMetrics: true
    });
  },

  /**
   * Standard logging - balanced performance and information
   */
  standard(): ReturnType<typeof requestLoggerMiddleware> {
    return requestLoggerMiddleware({
      logLevel: 'info',
      logRequestBody: false,
      logResponseBody: false,
      includePerformanceMetrics: true,
      skipPaths: ['/health', '/ping', '/metrics']
    });
  },

  /**
   * Debug logging - includes bodies but masks sensitive data
   */
  debug(): ReturnType<typeof requestLoggerMiddleware> {
    return requestLoggerMiddleware({
      logLevel: 'debug',
      logRequestBody: true,
      logResponseBody: true,
      maxBodyLength: 1000,
      includePerformanceMetrics: true
    });
  }
};