/**
 * 基础验证器
 * 提供通用的请求验证功能
 */
import type { ClientType } from '@/types';
import { throwError, ValidationError } from '@/middleware/error-handler.js';
import { SYSTEM_LIMITS } from '@/utils/constants.js';

/**
 * 验证规则接口
 */
export interface ValidationRule<T = any> {
  validate(value: T): boolean;
  message: string;
  code?: string;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  isValid: boolean;
  errors: Array<{
    field: string;
    message: string;
    code?: string;
  }>;
}

/**
 * 基础验证器类
 */
export class BaseValidator {
  /**
   * 验证请求体大小
   */
  static validateRequestSize(request: Request): void {
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (size > SYSTEM_LIMITS.MAX_REQUEST_SIZE) {
        throwError.validation(
          `Request size ${size} bytes exceeds maximum allowed ${SYSTEM_LIMITS.MAX_REQUEST_SIZE} bytes`,
          { requestSize: size, maxSize: SYSTEM_LIMITS.MAX_REQUEST_SIZE }
        );
      }
    }
  }

  /**
   * 验证Content-Type
   */
  static validateContentType(request: Request, expectedTypes: string[] = ['application/json']): void {
    const contentType = request.headers.get('content-type') || '';
    const isValid = expectedTypes.some(type => contentType.includes(type));
    
    if (!isValid) {
      throwError.validation(
        `Invalid content type. Expected one of: ${expectedTypes.join(', ')}, got: ${contentType}`,
        { contentType, expectedTypes }
      );
    }
  }

  /**
   * 验证必填字段
   */
  static validateRequired<T>(value: T, fieldName: string): T {
    if (value === null || value === undefined || value === '') {
      throwError.validation(
        `Field '${fieldName}' is required`,
        { field: fieldName, value }
      );
    }
    return value;
  }

  /**
   * 验证字符串长度
   */
  static validateStringLength(
    value: string,
    fieldName: string,
    minLength?: number,
    maxLength?: number
  ): void {
    if (minLength !== undefined && value.length < minLength) {
      throwError.validation(
        `Field '${fieldName}' must be at least ${minLength} characters long`,
        { field: fieldName, value: value.length, minLength }
      );
    }

    if (maxLength !== undefined && value.length > maxLength) {
      throwError.validation(
        `Field '${fieldName}' must be no more than ${maxLength} characters long`,
        { field: fieldName, value: value.length, maxLength }
      );
    }
  }

  /**
   * 验证数字范围
   */
  static validateNumberRange(
    value: number,
    fieldName: string,
    min?: number,
    max?: number
  ): void {
    if (min !== undefined && value < min) {
      throwError.validation(
        `Field '${fieldName}' must be at least ${min}`,
        { field: fieldName, value, min }
      );
    }

    if (max !== undefined && value > max) {
      throwError.validation(
        `Field '${fieldName}' must be no more than ${max}`,
        { field: fieldName, value, max }
      );
    }
  }

  /**
   * 验证数组长度
   */
  static validateArrayLength<T>(
    array: T[],
    fieldName: string,
    minLength?: number,
    maxLength?: number
  ): void {
    if (minLength !== undefined && array.length < minLength) {
      throwError.validation(
        `Field '${fieldName}' must contain at least ${minLength} items`,
        { field: fieldName, length: array.length, minLength }
      );
    }

    if (maxLength !== undefined && array.length > maxLength) {
      throwError.validation(
        `Field '${fieldName}' must contain no more than ${maxLength} items`,
        { field: fieldName, length: array.length, maxLength }
      );
    }
  }

  /**
   * 验证枚举值
   */
  static validateEnum<T>(
    value: T,
    fieldName: string,
    allowedValues: T[]
  ): void {
    if (!allowedValues.includes(value)) {
      throwError.validation(
        `Field '${fieldName}' must be one of: ${allowedValues.join(', ')}`,
        { field: fieldName, value, allowedValues }
      );
    }
  }

  /**
   * 验证邮箱格式
   */
  static validateEmail(email: string, fieldName: string = 'email'): void {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throwError.validation(
        `Field '${fieldName}' must be a valid email address`,
        { field: fieldName, value: email }
      );
    }
  }

  /**
   * 验证URL格式
   */
  static validateUrl(url: string, fieldName: string = 'url'): void {
    try {
      new URL(url);
    } catch {
      throwError.validation(
        `Field '${fieldName}' must be a valid URL`,
        { field: fieldName, value: url }
      );
    }
  }

  /**
   * 验证正则表达式
   */
  static validateRegex(
    value: string,
    pattern: RegExp,
    fieldName: string,
    message?: string
  ): void {
    if (!pattern.test(value)) {
      throwError.validation(
        message || `Field '${fieldName}' has invalid format`,
        { field: fieldName, value, pattern: pattern.source }
      );
    }
  }

  /**
   * 验证JSON格式
   */
  static validateJson(value: string, fieldName: string): any {
    try {
      return JSON.parse(value);
    } catch (error) {
      throwError.validation(
        `Field '${fieldName}' must be valid JSON`,
        { field: fieldName, value, error: error instanceof Error ? error.message : 'Invalid JSON' }
      );
    }
  }

  /**
   * 批量验证
   */
  static validateBatch(validations: Array<() => void>): void {
    const errors: string[] = [];

    for (const validate of validations) {
      try {
        validate();
      } catch (error) {
        if (error instanceof ValidationError) {
          errors.push(error.message);
        } else {
          errors.push('Validation failed');
        }
      }
    }

    if (errors.length > 0) {
      throwError.validation(
        `Multiple validation errors: ${errors.join('; ')}`,
        { errors }
      );
    }
  }

  /**
   * 条件验证
   */
  static validateIf<T>(
    condition: boolean,
    value: T,
    validator: (value: T) => void
  ): void {
    if (condition) {
      validator(value);
    }
  }
}

/**
 * 请求体验证器
 */
export class RequestBodyValidator extends BaseValidator {
  /**
   * 验证通用请求体结构
   */
  static async validateCommonRequestBody(request: Request): Promise<any> {
    this.validateContentType(request);
    this.validateRequestSize(request);

    try {
      const body = await request.json();
      
      if (!body || typeof body !== 'object') {
        throwError.validation('Request body must be a valid JSON object');
      }

      return body;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      
      throwError.validation(
        'Invalid JSON in request body',
        { error: error instanceof Error ? error.message : 'Parse error' }
      );
    }
  }

  /**
   * 验证消息格式
   */
  static validateMessages(messages: any[], fieldName: string = 'messages'): void {
    this.validateRequired(messages, fieldName);
    this.validateArrayLength(messages, fieldName, 1);

    messages.forEach((message, index) => {
      const fieldPath = `${fieldName}[${index}]`;
      
      if (!message || typeof message !== 'object') {
        throwError.validation(
          `${fieldPath} must be an object`,
          { field: fieldPath, value: message }
        );
      }

      this.validateRequired(message.role, `${fieldPath}.role`);
      this.validateRequired(message.content, `${fieldPath}.content`);

      if (typeof message.content === 'string') {
        this.validateStringLength(message.content, `${fieldPath}.content`, 1, 32000);
      }
    });
  }

  /**
   * 验证模型参数
   */
  static validateModelParameters(params: any): void {
    if (params.temperature !== undefined) {
      this.validateNumberRange(params.temperature, 'temperature', 0, 2);
    }

    if (params.top_p !== undefined) {
      this.validateNumberRange(params.top_p, 'top_p', 0, 1);
    }

    if (params.max_tokens !== undefined) {
      this.validateNumberRange(params.max_tokens, 'max_tokens', 1, 4096);
    }

    if (params.stop !== undefined) {
      if (Array.isArray(params.stop)) {
        this.validateArrayLength(params.stop, 'stop', 0, 4);
      }
    }

    if (params.presence_penalty !== undefined) {
      this.validateNumberRange(params.presence_penalty, 'presence_penalty', -2, 2);
    }

    if (params.frequency_penalty !== undefined) {
      this.validateNumberRange(params.frequency_penalty, 'frequency_penalty', -2, 2);
    }
  }
}

/**
 * 适配器特定验证器工厂
 */
export function createAdapterValidator(clientType: ClientType) {
  return class AdapterValidator extends RequestBodyValidator {
    static clientType = clientType;

    /**
     * 验证客户端特定的请求格式
     */
    static validateClientSpecificRequest(body: any): void {
      switch (clientType) {
        case 'openai':
          this.validateOpenAIRequest(body);
          break;
        case 'claude':
          this.validateClaudeRequest(body);
          break;
        case 'gemini':
          this.validateGeminiRequest(body);
          break;
        default:
          // 通用验证
          break;
      }
    }

    private static validateOpenAIRequest(body: any): void {
      this.validateRequired(body.model, 'model');
      if (body.messages) {
        this.validateMessages(body.messages);
      }
    }

    private static validateClaudeRequest(body: any): void {
      this.validateRequired(body.model, 'model');
      if (body.messages) {
        this.validateMessages(body.messages);
      }
    }

    private static validateGeminiRequest(body: any): void {
      if (body.contents) {
        this.validateRequired(body.contents, 'contents');
        this.validateArrayLength(body.contents, 'contents', 1);
      }
    }
  };
}