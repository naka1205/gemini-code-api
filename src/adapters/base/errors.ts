/**
 * 统一错误处理工具
 * 提供标准化的错误类型和格式
 */

import { HTTPException } from 'hono/http-exception';

export interface ApiError {
  error: {
    message: string;
    type: string;
    code: string;
    details?: any;
  };
}

/**
 * 错误类型枚举
 */
export enum ErrorType {
  VALIDATION = 'validation_error',
  AUTHENTICATION = 'authentication_error',
  AUTHORIZATION = 'authorization_error',
  RATE_LIMIT = 'rate_limit_error',
  QUOTA_EXCEEDED = 'quota_exceeded_error',
  API_ERROR = 'api_error',
  NETWORK_ERROR = 'network_error',
  INTERNAL_ERROR = 'internal_error',
  NOT_FOUND = 'not_found_error',
  TIMEOUT = 'timeout_error',
  SERVICE_UNAVAILABLE = 'service_unavailable_error',
}

/**
 * 错误代码枚举
 */
export enum ErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_FIELD = 'MISSING_FIELD',
  INVALID_FORMAT = 'INVALID_FORMAT',
  INVALID_MODEL = 'INVALID_MODEL',
  INVALID_API_KEY = 'INVALID_API_KEY',
  API_KEY_EXPIRED = 'API_KEY_EXPIRED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  RATE_LIMITED = 'RATE_LIMITED',
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TIMEOUT = 'TIMEOUT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  API_ERROR = 'API_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
}

/**
 * 统一错误抛出工具
 */
export const throwError = {
  /**
   * 验证错误
   */
  validation: (message: string, details?: any, code: string = ErrorCode.INVALID_INPUT) => {
    throw new HTTPException(400, {
      message: JSON.stringify({
        error: {
          message,
          type: ErrorType.VALIDATION,
          code,
          details,
        },
      }),
    });
  },

  /**
   * 认证错误
   */
  authentication: (message: string, details?: any, code: string = ErrorCode.INVALID_API_KEY) => {
    throw new HTTPException(401, {
      message: JSON.stringify({
        error: {
          message,
          type: ErrorType.AUTHENTICATION,
          code,
          details,
        },
      }),
    });
  },

  /**
   * 授权错误
   */
  authorization: (message: string, details?: any, code: string = ErrorCode.INVALID_API_KEY) => {
    throw new HTTPException(403, {
      message: JSON.stringify({
        error: {
          message,
          type: ErrorType.AUTHORIZATION,
          code,
          details,
        },
      }),
    });
  },

  /**
   * 速率限制错误
   */
  rateLimit: (message: string, details?: any, code: string = ErrorCode.RATE_LIMITED) => {
    throw new HTTPException(429, {
      message: JSON.stringify({
        error: {
          message,
          type: ErrorType.RATE_LIMIT,
          code,
          details,
        },
      }),
    });
  },

  /**
   * 配额超限错误
   */
  quotaExceeded: (message: string, details?: any, code: string = ErrorCode.QUOTA_EXCEEDED) => {
    throw new HTTPException(429, {
      message: JSON.stringify({
        error: {
          message,
          type: ErrorType.QUOTA_EXCEEDED,
          code,
          details,
        },
      }),
    });
  },

  /**
   * API错误
   */
  api: (message: string, statusCode: number = 502, details?: any, code: string = ErrorCode.API_ERROR) => {
    throw new HTTPException(statusCode as any, {
      message: JSON.stringify({
        error: {
          message,
          type: ErrorType.API_ERROR,
          code,
          details,
        },
      }),
    });
  },

  /**
   * 网络错误
   */
  network: (message: string, details?: any, code: string = ErrorCode.NETWORK_ERROR) => {
    throw new HTTPException(502, {
      message: JSON.stringify({
        error: {
          message,
          type: ErrorType.NETWORK_ERROR,
          code,
          details,
        },
      }),
    });
  },

  /**
   * 内部错误
   */
  internal: (message: string, details?: any, code: string = ErrorCode.INTERNAL_ERROR) => {
    throw new HTTPException(500, {
      message: JSON.stringify({
        error: {
          message,
          type: ErrorType.INTERNAL_ERROR,
          code,
          details,
        },
      }),
    });
  },

  /**
   * 未找到错误
   */
  notFound: (message: string, details?: any, code: string = ErrorCode.MODEL_NOT_FOUND) => {
    throw new HTTPException(404, {
      message: JSON.stringify({
        error: {
          message,
          type: ErrorType.NOT_FOUND,
          code,
          details,
        },
      }),
    });
  },

  /**
   * 超时错误
   */
  timeout: (message: string, details?: any, code: string = ErrorCode.TIMEOUT) => {
    throw new HTTPException(408, {
      message: JSON.stringify({
        error: {
          message,
          type: ErrorType.TIMEOUT,
          code,
          details,
        },
      }),
    });
  },

  /**
   * 服务不可用错误
   */
  serviceUnavailable: (message: string, details?: any, code: string = ErrorCode.SERVICE_UNAVAILABLE) => {
    throw new HTTPException(503, {
      message: JSON.stringify({
        error: {
          message,
          type: ErrorType.SERVICE_UNAVAILABLE,
          code,
          details,
        },
      }),
    });
  },
};

/**
 * 创建标准化的API错误响应
 */
export function createApiError(
  type: ErrorType,
  message: string,
  code: string,
  details?: any
): ApiError {
  return {
    error: {
      message,
      type,
      code,
      details,
    },
  };
}

/**
 * 检查错误类型并转换为标准格式
 */
export function normalizeError(error: any): ApiError {
  if (error instanceof HTTPException) {
    try {
      const parsed = JSON.parse(error.message);
      if (parsed.error) {
        return parsed;
      }
    } catch {
      // 如果解析失败，创建标准错误
    }
    
    return createApiError(
      ErrorType.INTERNAL_ERROR,
      error.message || 'Internal server error',
      ErrorCode.INTERNAL_ERROR,
      { statusCode: error.status }
    );
  }

  if (error instanceof Error) {
    return createApiError(
      ErrorType.INTERNAL_ERROR,
      error.message || 'Unknown error occurred',
      ErrorCode.INTERNAL_ERROR,
      { stack: error.stack }
    );
  }

  return createApiError(
    ErrorType.INTERNAL_ERROR,
    String(error) || 'Unknown error occurred',
    ErrorCode.INTERNAL_ERROR,
    { originalError: error }
  );
}

/**
 * 安全地抛出错误，确保错误格式一致
 */
export function safeThrow(
  errorType: keyof typeof throwError,
  message: string,
  details?: any,
  code?: string
): never {
  const errorMethod = throwError[errorType];
  if (typeof errorMethod === 'function') {
    errorMethod(message, details, code);
  } else {
    throwError.internal(`Invalid error type: ${errorType}`, { message, details, code });
  }
  // 确保函数永远不会到达这里
  throw new Error('Unreachable code');
}