/**
 * API KEY提取器
 * 纯代理模式 - 从请求头中提取客户端提交的多个Gemini API KEY
 */
import type { ClientType } from '../../types/index.js';
import type { ClientDetectionResult } from './detector.js';

/**
 * API KEY提取结果
 */
export interface ExtractionResult {
  apiKeys: string[];
  totalKeys: number;
  source: string;
  clientType: ClientType;
  headerName: string;
  rawValue?: string;
}

/**
 * API KEY提取器
 */
export class ApiKeyExtractor {
  /**
   * 从请求中提取API KEY列表
   */
  extractApiKeys(request: Request, detectionResult?: ClientDetectionResult): ExtractionResult {
    const headers = request.headers;
    const clientType = detectionResult?.clientType || 'unknown';

    // 根据客户端类型尝试不同的提取策略
    switch (clientType) {
      case 'openai':
        return this.extractFromOpenAIHeaders(headers);
      case 'claude':
        return this.extractFromClaudeHeaders(headers);
      case 'gemini':
        return this.extractFromGeminiHeaders(headers);
      default:
        return this.extractFromAnyHeaders(headers);
    }
  }

  /**
   * 从指定的头中提取API KEY
   */
  extractFromHeader(headerValue: string | null, headerName: string, clientType: ClientType): ExtractionResult {
    if (!headerValue) {
      return {
        apiKeys: [],
        totalKeys: 0,
        source: 'header_missing',
        clientType,
        headerName,
      };
    }

    // 处理 Authorization Bearer 格式
    let cleanValue = headerValue;
    if (headerName.toLowerCase() === 'authorization' && headerValue.toLowerCase().startsWith('bearer ')) {
      cleanValue = headerValue.substring(7); // 移除 "Bearer " 前缀
    }

    // 按逗号分割多个KEY
    const apiKeys = cleanValue
      .split(',')
      .map(key => key.trim())
      .filter(key => key.length > 0);

    return {
      apiKeys,
      totalKeys: apiKeys.length,
      source: `header_${headerName}`,
      clientType,
      headerName,
      rawValue: headerValue,
    };
  }

  /**
   * 验证提取的API KEY是否为有效的Gemini格式
   */
  validateExtractedKeys(result: ExtractionResult): {
    validKeys: string[];
    invalidKeys: string[];
    warnings: string[];
  } {
    const validKeys: string[] = [];
    const invalidKeys: string[] = [];
    const warnings: string[] = [];

    for (const key of result.apiKeys) {
      if (this.isValidGeminiKeyFormat(key)) {
        validKeys.push(key);
      } else {
        invalidKeys.push(key);
        
        // 提供具体的警告信息
        if (key.startsWith('sk-')) {
          warnings.push(`OpenAI API key detected: ${this.maskKey(key)}. Please provide Gemini API key starting with "AI".`);
        } else if (key.includes('claude') || key.startsWith('claude-')) {
          warnings.push(`Claude API key detected: ${this.maskKey(key)}. Please provide Gemini API key starting with "AI".`);
        } else if (!key.startsWith('AI')) {
          warnings.push(`Invalid API key format: ${this.maskKey(key)}. API key must start with "AI".`);
        } else {
          warnings.push(`Invalid API key: ${this.maskKey(key)}. Please check your API key format.`);
        }
      }
    }

    return { validKeys, invalidKeys, warnings };
  }

  /**
   * 获取客户端类型对应的推荐头名称
   */
  getRecommendedHeader(clientType: ClientType): string {
    switch (clientType) {
      case 'openai':
        return 'Authorization';
      case 'claude':
        return 'x-api-key';
      case 'gemini':
        return 'x-goog-api-key';
      default:
        return 'Authorization';
    }
  }

  /**
   * 创建错误响应的建议信息
   */
  createExtractionGuidance(clientType: ClientType): string {
    const recommendedHeader = this.getRecommendedHeader(clientType);
    const clientName = this.getClientTypeName(clientType);

    if (clientType === 'claude') {
      return `For ${clientName} compatibility, please provide your Gemini API key(s) using one of the following headers:\n` +
             `• Recommended: x-api-key: YOUR_GEMINI_API_KEY\n` +
             `• Alternative: Authorization: Bearer YOUR_GEMINI_API_KEY\n` +
             `• Alternative: x-goog-api-key: YOUR_GEMINI_API_KEY\n` +
             `Multiple keys can be separated by commas for load balancing.`;
    }

    return `For ${clientName} compatibility, please provide your Gemini API key(s) using the ${recommendedHeader} header. Multiple keys can be separated by commas for load balancing.`;
  }

  // === 私有方法 ===

  private extractFromOpenAIHeaders(headers: Headers): ExtractionResult {
    // OpenAI 使用 Authorization: Bearer，但也支持其他头部
    const allApiKeys: string[] = [];
    
    // 1. 尝试 Authorization Bearer
    const authHeader = headers.get('authorization');
    if (authHeader) {
      const result = this.extractFromHeader(authHeader, 'authorization', 'openai');
      if (result.totalKeys > 0) {
        allApiKeys.push(...result.apiKeys);
      }
    }

    // 2. 尝试 x-api-key
    const apiKeyHeader = headers.get('x-api-key');
    if (apiKeyHeader) {
      const result = this.extractFromHeader(apiKeyHeader, 'x-api-key', 'openai');
      if (result.totalKeys > 0) {
        allApiKeys.push(...result.apiKeys);
      }
    }

    // 3. 尝试 x-goog-api-key
    const googleHeader = headers.get('x-goog-api-key');
    if (googleHeader) {
      const result = this.extractFromHeader(googleHeader, 'x-goog-api-key', 'openai');
      if (result.totalKeys > 0) {
        allApiKeys.push(...result.apiKeys);
      }
    }

    // 去重API密钥
    const uniqueApiKeys = [...new Set(allApiKeys)];

    if (uniqueApiKeys.length > 0) {
      return {
        apiKeys: uniqueApiKeys,
        totalKeys: uniqueApiKeys.length,
        source: 'openai_multiple_headers',
        clientType: 'openai',
        headerName: 'authorization',
      };
    }

    // 如果没有找到任何API KEY
    return {
      apiKeys: [],
      totalKeys: 0,
      source: 'no_api_keys_found',
      clientType: 'openai',
      headerName: 'authorization',
    };
  }

  private extractFromClaudeHeaders(headers: Headers): ExtractionResult {
    // Claude 优先使用 x-api-key，但也支持其他头部
    const allApiKeys: string[] = [];
    
    // 1. 尝试 x-api-key
    const apiKeyHeader = headers.get('x-api-key');
    if (apiKeyHeader) {
      const result = this.extractFromHeader(apiKeyHeader, 'x-api-key', 'claude');
      if (result.totalKeys > 0) {
        allApiKeys.push(...result.apiKeys);
      }
    }

    // 2. 尝试 Authorization Bearer 格式
    const authHeader = headers.get('authorization');
    if (authHeader) {
      const result = this.extractFromHeader(authHeader, 'authorization', 'claude');
      if (result.totalKeys > 0) {
        allApiKeys.push(...result.apiKeys);
      }
    }

    // 3. 尝试 x-goog-api-key（Gemini格式）
    const googleHeader = headers.get('x-goog-api-key');
    if (googleHeader) {
      const result = this.extractFromHeader(googleHeader, 'x-goog-api-key', 'claude');
      if (result.totalKeys > 0) {
        allApiKeys.push(...result.apiKeys);
      }
    }

    // 去重API密钥
    const uniqueApiKeys = [...new Set(allApiKeys)];

    if (uniqueApiKeys.length > 0) {
      return {
        apiKeys: uniqueApiKeys,
        totalKeys: uniqueApiKeys.length,
        source: 'claude_multiple_headers',
        clientType: 'claude',
        headerName: 'x-api-key',
      };
    }

    // 如果都没有找到，返回空结果但保持 claude 客户端类型
    return {
      apiKeys: [],
      totalKeys: 0,
      source: 'header_missing_with_fallback',
      clientType: 'claude',
      headerName: 'x-api-key',
    };
  }

  private extractFromGeminiHeaders(headers: Headers): ExtractionResult {
    // Gemini 使用 x-goog-api-key，但也支持其他头部
    const allApiKeys: string[] = [];
    
    // 1. 尝试 x-goog-api-key
    const googleHeader = headers.get('x-goog-api-key');
    if (googleHeader) {
      const result = this.extractFromHeader(googleHeader, 'x-goog-api-key', 'gemini');
      if (result.totalKeys > 0) {
        allApiKeys.push(...result.apiKeys);
      }
    }

    // 2. 尝试 Authorization Bearer 格式
    const authHeader = headers.get('authorization');
    if (authHeader) {
      const result = this.extractFromHeader(authHeader, 'authorization', 'gemini');
      if (result.totalKeys > 0) {
        allApiKeys.push(...result.apiKeys);
      }
    }

    // 3. 尝试 x-api-key
    const apiKeyHeader = headers.get('x-api-key');
    if (apiKeyHeader) {
      const result = this.extractFromHeader(apiKeyHeader, 'x-api-key', 'gemini');
      if (result.totalKeys > 0) {
        allApiKeys.push(...result.apiKeys);
      }
    }

    // 去重API密钥
    const uniqueApiKeys = [...new Set(allApiKeys)];

    if (uniqueApiKeys.length > 0) {
      return {
        apiKeys: uniqueApiKeys,
        totalKeys: uniqueApiKeys.length,
        source: 'gemini_multiple_headers',
        clientType: 'gemini',
        headerName: 'x-goog-api-key',
      };
    }

    // 回退到通用提取
    return this.extractFromAnyHeaders(headers);
  }

  private extractFromAnyHeaders(headers: Headers): ExtractionResult {
    // 按优先级尝试不同的头，并合并所有找到的API密钥
    const headerPriority = [
      { name: 'x-goog-api-key', clientType: 'gemini' as ClientType },
      { name: 'authorization', clientType: 'openai' as ClientType },
      { name: 'x-api-key', clientType: 'claude' as ClientType },
    ];

    const allApiKeys: string[] = [];
    let primaryClientType: ClientType = 'unknown';
    let primaryHeaderName = 'none';

    for (const { name, clientType } of headerPriority) {
      const headerValue = headers.get(name);
      if (headerValue) {
        const result = this.extractFromHeader(headerValue, name, clientType);
        if (result.totalKeys > 0) {
          // 合并API密钥
          allApiKeys.push(...result.apiKeys);
          
          // 记录第一个找到的客户端类型作为主要类型
          if (primaryClientType === 'unknown') {
            primaryClientType = result.clientType;
            primaryHeaderName = result.headerName;
          }
        }
      }
    }

    // 去重API密钥
    const uniqueApiKeys = [...new Set(allApiKeys)];

    if (uniqueApiKeys.length > 0) {
      return {
        apiKeys: uniqueApiKeys,
        totalKeys: uniqueApiKeys.length,
        source: `multiple_headers_merged`,
        clientType: primaryClientType,
        headerName: primaryHeaderName,
      };
    }

    // 如果没有找到任何API KEY
    return {
      apiKeys: [],
      totalKeys: 0,
      source: 'no_api_keys_found',
      clientType: 'unknown',
      headerName: 'none',
    };
  }

  private isValidGeminiKeyFormat(apiKey: string): boolean {
    // 简化验证：只检查是否以'AI'开头
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }

    const trimmedKey = apiKey.trim();
    if (!trimmedKey || trimmedKey.length < 3) {
      return false;
    }

    // 只检查是否以'AI'开头
    return trimmedKey.startsWith('AI');
  }

  private maskKey(apiKey: string): string {
    if (apiKey.length <= 8) {
      return '*'.repeat(apiKey.length);
    }

    const start = apiKey.substring(0, 4);
    const end = apiKey.substring(apiKey.length - 4);
    const middle = '*'.repeat(Math.max(0, apiKey.length - 8));
    
    return `${start}${middle}${end}`;
  }

  private getClientTypeName(clientType: ClientType): string {
    switch (clientType) {
      case 'openai':
        return 'OpenAI';
      case 'claude':
        return 'Claude';
      case 'gemini':
        return 'Gemini';
      default:
        return 'Unknown';
    }
  }
}

/**
 * 完整的认证信息提取结果
 */
export interface AuthExtractionResult {
  extraction: ExtractionResult;
  validation: {
    validKeys: string[];
    invalidKeys: string[];
    warnings: string[];
  };
  hasValidKeys: boolean;
  recommendation?: string;
}

/**
 * 全局API KEY提取器实例
 */
let globalExtractor: ApiKeyExtractor | null = null;

export function getGlobalExtractor(): ApiKeyExtractor {
  if (!globalExtractor) {
    globalExtractor = new ApiKeyExtractor();
  }
  return globalExtractor;
}

/**
 * 便捷函数：提取并验证API KEY
 */
export function extractAndValidateApiKeys(
  request: Request, 
  detectionResult?: ClientDetectionResult
): AuthExtractionResult {
  const extractor = getGlobalExtractor();
  const extraction = extractor.extractApiKeys(request, detectionResult);
  const validation = extractor.validateExtractedKeys(extraction);
  
  const result: AuthExtractionResult = {
    extraction,
    validation,
    hasValidKeys: validation.validKeys.length > 0,
  };

  // 如果没有有效的KEY，提供建议
  if (!result.hasValidKeys) {
    result.recommendation = extractor.createExtractionGuidance(extraction.clientType);
  }

  return result;
}