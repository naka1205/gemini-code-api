/**
 * 格式化工具函数
 * 错误响应和API格式转换
 */
import type { ClientType, TokenUsage } from '../types/index.js';
import { ERROR_MESSAGES } from './constants.js';

/**
 * 根据客户端类型格式化错误响应
 */
export function formatErrorResponse(
  clientType: ClientType,
  message: string,
  errorType: string = 'api_error',
  statusCode: number = 400
): { response: any; status: number } {
  switch (clientType) {
    case 'openai':
      return {
        response: {
          error: {
            message,
            type: errorType,
            code: statusCode === 401 ? 'invalid_api_key' : errorType,
            param: null,
          },
        },
        status: statusCode,
      };

    case 'claude':
      return {
        response: {
          type: 'error',
          error: {
            type: errorType === 'invalid_api_key' ? 'authentication_error' : errorType,
            message,
          },
        },
        status: statusCode,
      };

    case 'gemini':
      return {
        response: {
          error: {
            code: statusCode,
            message,
            status: statusCode === 401 ? 'UNAUTHENTICATED' : 'INVALID_ARGUMENT',
          },
        },
        status: statusCode,
      };

    default:
      return {
        response: {
          error: message,
          code: statusCode,
        },
        status: statusCode,
      };
  }
}

/**
 * 格式化认证错误
 */
export function formatAuthError(clientType: ClientType): { response: any; status: number } {
  const message = ERROR_MESSAGES.NO_API_KEY;
  return formatErrorResponse(clientType, message, 'authentication_error', 401);
}

/**
 * 格式化无效KEY错误
 */
export function formatInvalidKeyError(clientType: ClientType): { response: any; status: number } {
  const message = ERROR_MESSAGES.INVALID_API_KEY;
  return formatErrorResponse(clientType, message, 'invalid_api_key', 401);
}

/**
 * 格式化模型不支持错误
 */
export function formatUnsupportedModelError(clientType: ClientType, model: string): { response: any; status: number } {
  const message = `Model '${model}' is not supported. ${ERROR_MESSAGES.UNSUPPORTED_MODEL}`;
  return formatErrorResponse(clientType, message, 'invalid_request_error', 400);
}

/**
 * 格式化限流错误
 */
export function formatRateLimitError(clientType: ClientType): { response: any; status: number } {
  const message = ERROR_MESSAGES.RATE_LIMITED;
  return formatErrorResponse(clientType, message, 'rate_limit_exceeded', 429);
}

/**
 * 格式化内部错误
 */
export function formatInternalError(clientType: ClientType, originalError?: string): { response: any; status: number } {
  const message = originalError || ERROR_MESSAGES.INTERNAL_ERROR;
  return formatErrorResponse(clientType, message, 'internal_server_error', 500);
}

/**
 * 格式化超时错误
 */
export function formatTimeoutError(clientType: ClientType): { response: any; status: number } {
  const message = ERROR_MESSAGES.TIMEOUT;
  return formatErrorResponse(clientType, message, 'timeout', 408);
}

/**
 * 格式化Token使用信息
 */
export function formatTokenUsage(
  inputTokens: number = 0,
  outputTokens: number = 0,
  totalTokens?: number
): TokenUsage {
  return {
    prompt_tokens: inputTokens,
    completion_tokens: outputTokens,
    total_tokens: totalTokens || (inputTokens + outputTokens),
  };
}

/**
 * 格式化日期为ISO字符串
 */
export function formatDate(date: Date = new Date()): string {
  return date.toISOString();
}

/**
 * 格式化Unix时间戳
 */
export function formatTimestamp(date: Date = new Date()): number {
  return Math.floor(date.getTime() / 1000);
}

/**
 * 格式化响应ID
 */
export function formatResponseId(prefix: string = 'chatcmpl'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 9);
  return `${prefix}-${timestamp}${random}`;
}

/**
 * 格式化模型名称（用于响应）
 */
export function formatModelName(originalModel: string, _mappedModel: string): string {
  // 对于OpenAI和Claude客户端，返回原始模型名称以保持兼容性
  // 对于Gemini客户端，返回映射后的模型名称
  return originalModel;
}

/**
 * 截断敏感信息（如API密钥）用于日志
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 8) {
    return '***';
  }
  return `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`;
}

/**
 * 格式化请求摘要（用于日志）
 */
export function formatRequestSummary(
  method: string,
  url: string,
  clientType: ClientType,
  model?: string,
  hasApiKey: boolean = false
): string {
  const parts = [
    method.toUpperCase(),
    new URL(url).pathname,
    `client=${clientType}`,
  ];
  
  if (model) {
    parts.push(`model=${model}`);
  }
  
  parts.push(`auth=${hasApiKey ? 'yes' : 'no'}`);
  
  return parts.join(' ');
}