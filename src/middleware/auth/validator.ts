/**
 * API KEY验证器
 * 纯代理模式 - 验证客户端提交的Gemini API KEY格式和有效性
 */
import type { ClientType } from '../../types/index.js';

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
   * 简化验证：只检查是否以'AI'开头
   */
  validateApiKey(apiKey: string, _clientType?: ClientType): ValidationResult {
    // 基础检查：空值和类型
    if (!apiKey || typeof apiKey !== 'string') {
      return {
        isValid: false,
        reason: 'API key is required and must be a string',
      };
    }

    // 去除首尾空格
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      return {
        isValid: false,
        reason: 'API key cannot be empty',
      };
    }

    // 简化验证：只检查是否以'AI'开头
    if (!trimmedKey.startsWith('AI')) {
      return {
        isValid: false,
        reason: 'API key must start with "AI"',
      };
    }

    // 基本长度检查（至少3个字符）
    if (trimmedKey.length < 3) {
      return {
        isValid: false,
        reason: 'API key is too short',
      };
    }

    return {
      isValid: true,
      reason: 'validation_passed',
      normalizedKey: trimmedKey,
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
   * 检查API KEY是否可能是Gemini格式 (更宽松的检查)
   */
  isLikelyGeminiKey(apiKey: string): boolean {
    // 基础检查
    if (!apiKey || apiKey.length < 10) {
      return false;
    }

    // 明显不是Gemini的格式
    if (apiKey.startsWith('sk-') || apiKey.startsWith('claude-')) {
      return false;
    }

    // 其他情况都认为可能是有效的
    return true;
  }

  /**
   * 清理和标准化API KEY
   */
  normalizeApiKey(apiKey: string): string {
    return apiKey.trim();
  }

  /**
   * 检查KEY是否在黑名单中 (更宽松的检查)
   */
  isBlacklisted(apiKey: string): boolean {
    const blacklistedPrefixes = [
      'test',
      'demo', 
      'example',
      'placeholder',
      'your-api-key',
      'your_api_key',
      'fake',
    ];

    const lowerKey = apiKey.toLowerCase();
    
    // 只检查完全匹配或明显的测试键值
    return blacklistedPrefixes.some(prefix => 
      lowerKey === prefix || 
      lowerKey === prefix + '-key' ||
      lowerKey.startsWith(prefix + '-') && lowerKey.length < 20
    );
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