/**
 * API KEY验证器
 * 纯代理模式 - 验证客户端提交的Gemini API KEY格式和有效性
 */
import type { ClientType } from '@/types';
import { AUTH_CONFIG } from '@/utils/constants.js';

/**
 * API KEY验证结果
 */
export interface ValidationResult {
  isValid: boolean;
  reason: string;
  normalizedKey?: string;
  errors?: string[];
}

/**
 * 批量KEY验证结果
 */
export interface BatchValidationResult {
  validKeys: string[];
  invalidKeys: string[];
  totalKeys: number;
  validCount: number;
  errors: string[];
}

/**
 * API KEY验证器
 */
export class ApiKeyValidator {
  /**
   * 验证单个API KEY
   */
  validateApiKey(apiKey: string, _clientType?: ClientType): ValidationResult {
    const errors: string[] = [];

    // 基础格式检查
    const basicValidation = this.validateBasicFormat(apiKey);
    if (!basicValidation.isValid) {
      return basicValidation;
    }

    // 长度检查
    const lengthValidation = this.validateLength(apiKey);
    if (!lengthValidation.isValid) {
      errors.push(lengthValidation.reason);
    }

    // Gemini API KEY特定格式检查
    const geminiValidation = this.validateGeminiFormat(apiKey);
    if (!geminiValidation.isValid) {
      errors.push(geminiValidation.reason);
    }

    // 如果有错误，返回验证失败
    if (errors.length > 0) {
      return {
        isValid: false,
        reason: 'validation_failed',
        errors,
      };
    }

    // 标准化KEY格式
    const normalizedKey = this.normalizeApiKey(apiKey);

    return {
      isValid: true,
      reason: 'validation_passed',
      normalizedKey,
    };
  }

  /**
   * 批量验证API KEY列表
   */
  validateApiKeys(apiKeys: string[], clientType?: ClientType): BatchValidationResult {
    const validKeys: string[] = [];
    const invalidKeys: string[] = [];
    const errors: string[] = [];

    for (const key of apiKeys) {
      const result = this.validateApiKey(key, clientType);
      
      if (result.isValid && result.normalizedKey) {
        validKeys.push(result.normalizedKey);
      } else {
        invalidKeys.push(key);
        if (result.errors) {
          errors.push(...result.errors);
        } else {
          errors.push(result.reason);
        }
      }
    }

    return {
      validKeys,
      invalidKeys,
      totalKeys: apiKeys.length,
      validCount: validKeys.length,
      errors,
    };
  }

  /**
   * 检查API KEY是否可能是Gemini格式
   */
  isLikelyGeminiKey(apiKey: string): boolean {
    // Gemini API Keys 通常以 "AIza" 开头
    if (apiKey.startsWith('AIza')) {
      return true;
    }

    // 检查长度和字符集（Gemini keys通常是39字符的base64字符串）
    if (apiKey.length >= 35 && apiKey.length <= 45) {
      const base64Pattern = /^[A-Za-z0-9+/=_-]+$/;
      return base64Pattern.test(apiKey);
    }

    return false;
  }

  /**
   * 清理和标准化API KEY
   */
  normalizeApiKey(apiKey: string): string {
    return apiKey.trim();
  }

  /**
   * 检查KEY是否在黑名单中
   */
  isBlacklisted(apiKey: string): boolean {
    const blacklistedPrefixes = [
      'test',
      'demo',
      'example',
      'placeholder',
      'your-api-key',
      'sk-',  // OpenAI格式，应该转换为Gemini
      'claude-',  // Claude格式，应该转换为Gemini
    ];

    const lowerKey = apiKey.toLowerCase();
    return blacklistedPrefixes.some(prefix => lowerKey.startsWith(prefix));
  }

  /**
   * 获取KEY的掩码版本（用于日志）
   */
  maskApiKey(apiKey: string): string {
    if (apiKey.length <= 8) {
      return '*'.repeat(apiKey.length);
    }

    const start = apiKey.substring(0, 4);
    const end = apiKey.substring(apiKey.length - 4);
    const middle = '*'.repeat(apiKey.length - 8);
    
    return `${start}${middle}${end}`;
  }

  // === 私有验证方法 ===

  private validateBasicFormat(apiKey: string): ValidationResult {
    // 空值检查
    if (!apiKey || typeof apiKey !== 'string') {
      return {
        isValid: false,
        reason: 'empty_or_invalid_type',
      };
    }

    // 去除首尾空格
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      return {
        isValid: false,
        reason: 'empty_after_trim',
      };
    }

    // 检查是否包含无效字符
    const invalidChars = /[<>{}()[\]|\\^~`]/;
    if (invalidChars.test(trimmedKey)) {
      return {
        isValid: false,
        reason: 'contains_invalid_characters',
      };
    }

    // 检查是否在黑名单中
    if (this.isBlacklisted(trimmedKey)) {
      return {
        isValid: false,
        reason: 'blacklisted_key',
      };
    }

    return {
      isValid: true,
      reason: 'basic_format_valid',
    };
  }

  private validateLength(apiKey: string): ValidationResult {
    const length = apiKey.length;

    if (length < AUTH_CONFIG.MIN_API_KEY_LENGTH) {
      return {
        isValid: false,
        reason: `key_too_short_min_${AUTH_CONFIG.MIN_API_KEY_LENGTH}`,
      };
    }

    if (length > AUTH_CONFIG.MAX_API_KEY_LENGTH) {
      return {
        isValid: false,
        reason: `key_too_long_max_${AUTH_CONFIG.MAX_API_KEY_LENGTH}`,
      };
    }

    return {
      isValid: true,
      reason: 'length_valid',
    };
  }

  private validateGeminiFormat(apiKey: string): ValidationResult {
    // 检查是否可能是Gemini格式
    if (!this.isLikelyGeminiKey(apiKey)) {
      // 如果不像Gemini格式，检查是否是其他已知格式
      if (apiKey.startsWith('sk-')) {
        return {
          isValid: false,
          reason: 'openai_format_detected_need_gemini_key',
        };
      }

      if (apiKey.startsWith('claude-') || apiKey.includes('claude')) {
        return {
          isValid: false,
          reason: 'claude_format_detected_need_gemini_key',
        };
      }

      return {
        isValid: false,
        reason: 'not_gemini_format',
      };
    }

    return {
      isValid: true,
      reason: 'gemini_format_valid',
    };
  }
}

/**
 * 全局API KEY验证器实例
 */
let globalValidator: ApiKeyValidator | null = null;

export function getGlobalValidator(): ApiKeyValidator {
  if (!globalValidator) {
    globalValidator = new ApiKeyValidator();
  }
  return globalValidator;
}

/**
 * 便捷函数：验证单个API KEY
 */
export function validateApiKey(apiKey: string, clientType?: ClientType): ValidationResult {
  return getGlobalValidator().validateApiKey(apiKey, clientType);
}

/**
 * 便捷函数：批量验证API KEY
 */
export function validateApiKeys(apiKeys: string[], clientType?: ClientType): BatchValidationResult {
  return getGlobalValidator().validateApiKeys(apiKeys, clientType);
}