/**
 * 基础错误处理
 * 适配器层面的错误处理和转换
 */
import { AppError, ErrorType, throwError } from '../../middleware/error-handler.js';
import type { ClientType } from '../../types/index.js';

/**
 * Gemini API错误响应格式
 */
export interface GeminiErrorResponse {
  error: {
    code: number;
    message: string;
    status: string;
    details?: any[];
  };
}

/**
 * 适配器错误处理器
 */
export class AdapterErrorHandler {
  /**
   * 处理Gemini API错误响应
   */
  static handleGeminiError(errorResponse: GeminiErrorResponse, apiKey: string): never {
    const { error } = errorResponse;
    const maskedKey = this.maskApiKey(apiKey);

    switch (error.code) {
      case 400:
        throwError.validation(
          `Gemini API validation error: ${error.message}`,
          { geminiError: error, apiKey: maskedKey }
        );
        throw new Error('Unreachable'); // TypeScript流程控制
        
      case 401:
        throwError.authentication(
          `Invalid Gemini API key: ${maskedKey}. Please check your API key.`,
          { geminiError: error, apiKey: maskedKey }
        );
        throw new Error('Unreachable');
        
      case 403:
        throwError.authentication(
          `Gemini API access denied for key: ${maskedKey}. Please check your permissions.`,
          { geminiError: error, apiKey: maskedKey }
        );
        throw new Error('Unreachable');
        
      case 404:
        throwError.validation(
          `Gemini API resource not found: ${error.message}`,
          { geminiError: error, apiKey: maskedKey }
        );
        throw new Error('Unreachable');
        
      case 429:
        throwError.rateLimit(
          `Gemini API rate limit exceeded for key: ${maskedKey}. Please try again later.`,
          { geminiError: error, apiKey: maskedKey }
        );
        throw new Error('Unreachable');
        
      case 500:
      case 502:
      case 503:
      case 504:
        throwError.api(
          `Gemini API server error: ${error.message}`,
          error.code,
          { geminiError: error, apiKey: maskedKey }
        );
        throw new Error('Unreachable');
        
      default:
        throwError.api(
          `Gemini API error: ${error.message}`,
          error.code || 500,
          { geminiError: error, apiKey: maskedKey }
        );
        throw new Error('Unreachable');
    }
  }

  /**
   * 处理网络错误
   */
  static handleNetworkError(error: Error, apiKey: string): never {
    const maskedKey = this.maskApiKey(apiKey);

    if (error.name === 'AbortError') {
      throwError.network(
        'Request timeout while calling Gemini API',
        { originalError: error.message, apiKey: maskedKey }
      );
      throw new Error('Unreachable');
    }

    if (error.message.includes('fetch')) {
      throwError.network(
        'Network error while calling Gemini API',
        { originalError: error.message, apiKey: maskedKey }
      );
      throw new Error('Unreachable');
    }

    throwError.api(
      `Unexpected error calling Gemini API: ${error.message}`,
      500,
      { originalError: error.message, apiKey: maskedKey }
    );
    throw new Error('Unreachable');
  }

  /**
   * 处理JSON解析错误
   */
  static handleJsonParseError(error: Error, context: string): never {
    throwError.validation(
      `Invalid JSON in ${context}: ${error.message}`,
      { parseError: error.message, context }
    );
    throw new Error('Unreachable');
  }

  /**
   * 处理模型映射错误
   */
  static handleModelMappingError(originalModel: string, clientType: ClientType): never {
    throwError.validation(
      `Unsupported model '${originalModel}' for ${clientType} client`,
      { originalModel, clientType, supportedModels: this.getSupportedModels(clientType) }
    );
    throw new Error('Unreachable');
  }

  /**
   * 处理转换错误
   */
  static handleTransformError(error: Error, transformType: string): never {
    throwError.internal(
      `Request/response transformation failed (${transformType}): ${error.message}`,
      { transformType, originalError: error.message }
    );
    throw new Error('Unreachable');
  }

  /**
   * 创建适配器特定错误
   */
  static createAdapterError(
    message: string,
    clientType: ClientType,
    errorType: ErrorType = ErrorType.INTERNAL_ERROR,
    statusCode: number = 500
  ): AppError {
    return new AppError(
      `${clientType.toUpperCase()} adapter error: ${message}`,
      errorType,
      statusCode,
      true,
      { clientType, adapterError: true }
    );
  }

  /**
   * 验证响应完整性
   */
  static validateResponse(response: any, expectedFields: string[]): void {
    if (!response || typeof response !== 'object') {
      throwError.api('Invalid response format from Gemini API');
    }

    const missingFields = expectedFields.filter(field => !(field in response));
    if (missingFields.length > 0) {
      throwError.api(
        `Incomplete response from Gemini API, missing fields: ${missingFields.join(', ')}`,
        502,
        { missingFields, response }
      );
    }
  }

  /**
   * 处理流式响应错误
   */
  static handleStreamingError(error: Error, apiKey: string): never {
    const maskedKey = this.maskApiKey(apiKey);

    if (error.message.includes('stream')) {
      throwError.api(
        'Streaming response error from Gemini API',
        502,
        { originalError: error.message, apiKey: maskedKey }
      );
      throw new Error('Unreachable');
    }

    this.handleNetworkError(error, apiKey);
  }

  // === 私有辅助方法 ===

  /**
   * 掩码API密钥
   */
  private static maskApiKey(apiKey: string): string {
    if (apiKey.length <= 8) {
      return '*'.repeat(apiKey.length);
    }

    const start = apiKey.substring(0, 4);
    const end = apiKey.substring(apiKey.length - 4);
    const middle = '*'.repeat(apiKey.length - 8);
    
    return `${start}${middle}${end}`;
  }

  /**
   * 获取支持的模型列表
   */
  private static getSupportedModels(clientType: ClientType): string[] {
    switch (clientType) {
      case 'openai':
        return ['gpt-4', 'gpt-4o', 'gpt-3.5-turbo', 'gpt-4-turbo'];
      case 'claude':
        return ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-sonnet-20240229'];
      case 'gemini':
        return ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-pro'];
      default:
        return [];
    }
  }
}

/**
 * 错误恢复策略
 */
export class ErrorRecoveryStrategy {
  /**
   * 判断错误是否可重试
   */
  static isRetryableError(error: Error | AppError): boolean {
    if (error instanceof AppError) {
      // 网络错误、超时错误、5xx错误可重试
      return (
        error.type === ErrorType.NETWORK_ERROR ||
        (error.type === ErrorType.API_ERROR && error.statusCode >= 500)
      );
    }

    // 网络相关错误可重试
    return (
      error.name === 'AbortError' ||
      error.message.includes('fetch') ||
      error.message.includes('network') ||
      error.message.includes('timeout')
    );
  }

  /**
   * 判断是否应该切换API密钥
   */
  static shouldSwitchApiKey(error: Error | AppError): boolean {
    if (error instanceof AppError) {
      // 401、403、429错误应该切换密钥
      return (
        error.type === ErrorType.AUTHENTICATION_ERROR ||
        error.type === ErrorType.RATE_LIMIT_ERROR ||
        (error.type === ErrorType.API_ERROR && [401, 403, 429].includes(error.statusCode))
      );
    }

    return false;
  }

  /**
   * 获取重试延迟时间
   */
  static getRetryDelay(attempt: number, error: Error | AppError): number {
    let baseDelay = 1000; // 1秒基础延迟

    if (error instanceof AppError && error.type === ErrorType.RATE_LIMIT_ERROR) {
      baseDelay = 5000; // 限流错误使用更长延迟
    }

    // 指数退避，但有最大限制
    return Math.min(baseDelay * Math.pow(2, attempt), 30000);
  }

  /**
   * 创建错误上下文信息
   */
  static createErrorContext(
    error: Error | AppError,
    clientType: ClientType,
    apiKey: string,
    attempt: number = 1
  ): Record<string, any> {
    return {
      clientType,
      apiKey: AdapterErrorHandler['maskApiKey'](apiKey),
      attempt,
      errorType: error instanceof AppError ? error.type : 'unknown',
      errorName: error.name,
      timestamp: Date.now(),
      isRetryable: this.isRetryableError(error),
      shouldSwitchKey: this.shouldSwitchApiKey(error),
    };
  }
}