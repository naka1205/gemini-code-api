/**
 * 错误处理中间件
 * 统一处理应用程序中的错误和异常
 */
import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ErrorType } from '../types/index.js';
export { ErrorType }; // 重新导出ErrorType
import { ERROR_MESSAGES } from '../utils/constants.js';
import { getLogger } from './logger.js';

/**
 * 应用程序错误类
 */
export class AppError extends Error {
  public readonly type: ErrorType;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, any> | undefined;

  constructor(
    message: string,
    type: ErrorType = ErrorType.INTERNAL_ERROR,
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context ?? undefined;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 认证错误
 */
export class AuthenticationError extends AppError {
  constructor(message: string = ERROR_MESSAGES.NO_API_KEY, context?: Record<string, any>) {
    super(message, ErrorType.AUTHENTICATION_ERROR, 401, true, context);
    this.name = 'AuthenticationError';
  }
}

/**
 * 验证错误
 */
export class ValidationError extends AppError {
  constructor(message: string = ERROR_MESSAGES.INVALID_REQUEST, context?: Record<string, any>) {
    super(message, ErrorType.VALIDATION_ERROR, 400, true, context);
    this.name = 'ValidationError';
  }
}

/**
 * 速率限制错误
 */
export class RateLimitError extends AppError {
  constructor(message: string = ERROR_MESSAGES.RATE_LIMITED, context?: Record<string, any>) {
    super(message, ErrorType.RATE_LIMIT_ERROR, 429, true, context);
    this.name = 'RateLimitError';
  }
}

/**
 * API错误
 */
export class ApiError extends AppError {
  constructor(message: string, statusCode: number = 502, context?: Record<string, any>) {
    super(message, ErrorType.API_ERROR, statusCode, true, context);
    this.name = 'ApiError';
  }
}

/**
 * 网络错误
 */
export class NetworkError extends AppError {
  constructor(message: string = ERROR_MESSAGES.TIMEOUT, context?: Record<string, any>) {
    super(message, ErrorType.NETWORK_ERROR, 502, true, context);
    this.name = 'NetworkError';
  }
}

/**
 * 错误响应格式
 */
export interface ErrorResponse {
  error: {
    type: string;
    message: string;
    code?: string;
    details?: any;
    requestId?: string;
    timestamp: number;
  };
}

/**
 * 错误处理中间件
 */
export function errorHandler() {
  return async (c: Context, next: Next) => {
    try {
      await next();
    } catch (error) {
      return await handleError(error, c);
    }
  };
}

/**
 * 处理错误
 */
export async function handleError(error: unknown, c: Context): Promise<Response> {
  const logger = getLogger(c);
  const requestId = c.get('requestId') || 'unknown';

  // 确定错误类型和响应
  let statusCode: number;
  let errorResponse: ErrorResponse;

  if (error instanceof AppError) {
    // 应用程序定义的错误
    statusCode = error.statusCode;
    errorResponse = createErrorResponse(
      error.type,
      error.message,
      requestId,
      error.context
    );

    // 记录操作性错误为警告，非操作性错误为错误
    if (error.isOperational) {
      logger.warn(`Operational error: ${error.message}`, {
        type: error.type,
        statusCode: error.statusCode,
        context: error.context,
      });
    } else {
      logger.error(`Non-operational error: ${error.message}`, error, {
        type: error.type,
        statusCode: error.statusCode,
        context: error.context,
      });
    }
  } else if (error instanceof HTTPException) {
    // Hono HTTP异常
    statusCode = error.status;
    errorResponse = createErrorResponse(
      ErrorType.API_ERROR,
      error.message,
      requestId
    );

    logger.warn(`HTTP exception: ${error.message}`, {
      statusCode: error.status,
    });
  } else if (error instanceof Error) {
    // 标准JavaScript错误
    statusCode = 500;
    errorResponse = createErrorResponse(
      ErrorType.INTERNAL_ERROR,
      shouldShowDetailedErrors() ? `${error.name}: ${error.message}\n${error.stack}` : ERROR_MESSAGES.INTERNAL_ERROR,
      requestId
    );

    logger.error(`Unhandled error: ${error.message}`, error, {
      name: error.name,
      stack: error.stack,
      cause: error.cause
    });
  } else {
    // 未知错误类型
    statusCode = 500;
    errorResponse = createErrorResponse(
      ErrorType.INTERNAL_ERROR,
      shouldShowDetailedErrors() ? `Unknown error: ${String(error)}` : ERROR_MESSAGES.INTERNAL_ERROR,
      requestId
    );

    logger.error('Unknown error type', new Error(String(error)), {
      errorType: typeof error,
      errorValue: error
    });
  }

  // 设置响应状态码
  c.status(statusCode as any);

  // 根据客户端类型格式化错误响应
  const clientType = c.get('clientType') || 'unknown';
  const formattedResponse = formatErrorForClient(errorResponse, clientType);

  return c.json(formattedResponse);
}

/**
 * 创建标准错误响应
 */
function createErrorResponse(
  type: ErrorType,
  message: string,
  requestId: string,
  details?: any
): ErrorResponse {
  return {
    error: {
      type,
      message,
      details,
      requestId,
      timestamp: Date.now(),
    },
  };
}

/**
 * 根据客户端类型格式化错误响应
 */
function formatErrorForClient(errorResponse: ErrorResponse, clientType: string): any {
  switch (clientType) {
    case 'openai':
      return formatOpenAIError(errorResponse);
    case 'claude':
      return formatClaudeError(errorResponse);
    case 'gemini':
      return formatGeminiError(errorResponse);
    default:
      return errorResponse;
  }
}

/**
 * 格式化为OpenAI错误格式
 */
function formatOpenAIError(errorResponse: ErrorResponse): any {
  const { error } = errorResponse;
  
  return {
    error: {
      message: error.message,
      type: error.type,
      code: mapToOpenAIErrorCode(error.type as any),
      param: null,
    },
  };
}

/**
 * 格式化为Claude错误格式
 */
function formatClaudeError(errorResponse: ErrorResponse): any {
  const { error } = errorResponse;
  
  return {
    type: 'error',
    error: {
      type: mapToClaudeErrorType(error.type as any),
      message: error.message,
    },
  };
}

/**
 * 格式化为Gemini错误格式
 */
function formatGeminiError(errorResponse: ErrorResponse): any {
  const { error } = errorResponse;
  
  return {
    error: {
      code: mapToGeminiErrorCode(error.type as any),
      message: error.message,
      status: (error.type as any).toUpperCase(),
    },
  };
}

/**
 * 映射到OpenAI错误代码
 */
function mapToOpenAIErrorCode(errorType: ErrorType): string {
  switch (errorType) {
    case ErrorType.AUTHENTICATION_ERROR:
      return 'invalid_api_key';
    case ErrorType.VALIDATION_ERROR:
      return 'invalid_request_error';
    case ErrorType.RATE_LIMIT_ERROR:
      return 'rate_limit_exceeded';
    case ErrorType.API_ERROR:
      return 'api_error';
    case ErrorType.NETWORK_ERROR:
      return 'api_connection_error';
    default:
      return 'internal_server_error';
  }
}

/**
 * 映射到Claude错误类型
 */
function mapToClaudeErrorType(errorType: ErrorType): string {
  switch (errorType) {
    case ErrorType.AUTHENTICATION_ERROR:
      return 'authentication_error';
    case ErrorType.VALIDATION_ERROR:
      return 'invalid_request_error';
    case ErrorType.RATE_LIMIT_ERROR:
      return 'rate_limit_error';
    case ErrorType.API_ERROR:
      return 'api_error';
    case ErrorType.NETWORK_ERROR:
      return 'overloaded_error';
    default:
      return 'internal_server_error';
  }
}

/**
 * 映射到Gemini错误代码
 */
function mapToGeminiErrorCode(errorType: ErrorType): number {
  switch (errorType) {
    case ErrorType.AUTHENTICATION_ERROR:
      return 401;
    case ErrorType.VALIDATION_ERROR:
      return 400;
    case ErrorType.RATE_LIMIT_ERROR:
      return 429;
    case ErrorType.API_ERROR:
      return 502;
    case ErrorType.NETWORK_ERROR:
      return 503;
    default:
      return 500;
  }
}

/**
 * 检查是否显示详细错误信息
 * 单一生产环境部署，始终显示详细错误便于调试
 */
function shouldShowDetailedErrors(): boolean {
  return true; // 简化逻辑，始终显示详细错误
}

/**
 * 创建便捷的错误抛出函数
 */
export const throwError = {
  authentication: (message?: string, context?: Record<string, any>) => {
    throw new AuthenticationError(message, context);
  },
  
  validation: (message?: string, context?: Record<string, any>) => {
    throw new ValidationError(message, context);
  },
  
  rateLimit: (message?: string, context?: Record<string, any>) => {
    throw new RateLimitError(message, context);
  },
  
  api: (message: string, statusCode?: number, context?: Record<string, any>) => {
    throw new ApiError(message, statusCode, context);
  },
  
  network: (message?: string, context?: Record<string, any>) => {
    throw new NetworkError(message, context);
  },
  
  internal: (message?: string, context?: Record<string, any>) => {
    throw new AppError(
      message || ERROR_MESSAGES.INTERNAL_ERROR,
      ErrorType.INTERNAL_ERROR,
      500,
      false,
      context
    );
  },
};

/**
 * 错误边界装饰器（用于异步函数）
 */
export function errorBoundary<T extends any[], R>(
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      // 将未知错误包装为内部错误
      throw new AppError(
        error instanceof Error ? error.message : 'Unknown error',
        ErrorType.INTERNAL_ERROR,
        500,
        false
      );
    }
  };
}