/**
 * API KEY提取器
 * 纯代理模式 - 从请求头中提取客户端提交的多个Gemini API KEY
 */
import type { ClientType } from '@/types';
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
          warnings.push(`OpenAI API key detected: ${this.maskKey(key)}. Please provide Gemini API key instead.`);
        } else if (key.includes('claude') || key.startsWith('claude-')) {
          warnings.push(`Claude API key detected: ${this.maskKey(key)}. Please provide Gemini API key instead.`);
        } else {
          warnings.push(`Invalid API key format: ${this.maskKey(key)}. Please provide valid Gemini API key.`);
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

    return `For ${clientName} compatibility, please provide your Gemini API key(s) using the ${recommendedHeader} header. Multiple keys can be separated by commas for load balancing.`;
  }

  // === 私有方法 ===

  private extractFromOpenAIHeaders(headers: Headers): ExtractionResult {
    // OpenAI 使用 Authorization: Bearer
    const authHeader = headers.get('authorization');
    return this.extractFromHeader(authHeader, 'authorization', 'openai');
  }

  private extractFromClaudeHeaders(headers: Headers): ExtractionResult {
    // Claude 使用 x-api-key
    const apiKeyHeader = headers.get('x-api-key');
    return this.extractFromHeader(apiKeyHeader, 'x-api-key', 'claude');
  }

  private extractFromGeminiHeaders(headers: Headers): ExtractionResult {
    // Gemini 使用 x-goog-api-key
    const googleHeader = headers.get('x-goog-api-key');
    
    if (googleHeader) {
      return this.extractFromHeader(googleHeader, 'x-goog-api-key', 'gemini');
    }

    // 回退到通用提取
    return this.extractFromAnyHeaders(headers);
  }

  private extractFromAnyHeaders(headers: Headers): ExtractionResult {
    // 按优先级尝试不同的头
    const headerPriority = [
      { name: 'x-goog-api-key', clientType: 'gemini' as ClientType },
      { name: 'authorization', clientType: 'openai' as ClientType },
      { name: 'x-api-key', clientType: 'claude' as ClientType },
    ];

    for (const { name, clientType } of headerPriority) {
      const headerValue = headers.get(name);
      if (headerValue) {
        const result = this.extractFromHeader(headerValue, name, clientType);
        if (result.totalKeys > 0) {
          return result;
        }
      }
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
    // 基础检查
    if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 20) {
      return false;
    }

    // Gemini API Keys 通常以 "AIza" 开头
    if (apiKey.startsWith('AIza')) {
      return true;
    }

    // 检查长度和字符集（Gemini keys通常是base64风格）
    if (apiKey.length >= 35 && apiKey.length <= 45) {
      const base64Pattern = /^[A-Za-z0-9+/=_-]+$/;
      return base64Pattern.test(apiKey);
    }

    return false;
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