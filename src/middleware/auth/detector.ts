/**
 * 客户端类型检测器
 * 根据请求头和路径自动识别客户端类型（OpenAI、Claude、Gemini）
 */
import type { ClientType } from '@/types';

/**
 * 客户端检测结果
 */
export interface ClientDetectionResult {
  clientType: ClientType;
  confidence: number; // 0-1 之间的置信度
  reason: string;
  detectedHeaders: string[];
}

/**
 * 客户端类型检测器
 */
export class ClientDetector {
  /**
   * 检测客户端类型
   */
  detect(request: Request): ClientDetectionResult {
    const url = new URL(request.url);
    const headers = request.headers;
    const userAgent = headers.get('user-agent') || '';
    
    // 检测路径特征
    const pathDetection = this.detectByPath(url.pathname);
    if (pathDetection.confidence > 0.8) {
      return pathDetection;
    }

    // 检测请求头特征
    const headerDetection = this.detectByHeaders(headers);
    if (headerDetection.confidence > 0.7) {
      return headerDetection;
    }

    // 检测User-Agent特征
    const uaDetection = this.detectByUserAgent(userAgent);
    if (uaDetection.confidence > 0.6) {
      return uaDetection;
    }

    // 检测认证头特征
    const authDetection = this.detectByAuthHeaders(headers);
    if (authDetection.confidence > 0.5) {
      return authDetection;
    }

    // 如果都无法确定，返回路径检测结果（优先级最高）
    if (pathDetection.confidence > 0) {
      return pathDetection;
    }

    // 默认返回未知类型
    return {
      clientType: 'unknown',
      confidence: 0,
      reason: 'no_distinctive_features',
      detectedHeaders: [],
    };
  }

  /**
   * 检查是否为已知的客户端类型
   */
  isKnownClient(clientType: ClientType): boolean {
    return ['openai', 'claude', 'gemini'].includes(clientType);
  }

  /**
   * 获取客户端的预期认证头名称
   */
  getExpectedAuthHeader(clientType: ClientType): string {
    switch (clientType) {
      case 'openai':
        return 'authorization';
      case 'claude':
        return 'x-api-key';
      case 'gemini':
        return 'x-goog-api-key';
      default:
        return 'authorization';
    }
  }

  /**
   * 获取客户端的友好名称
   */
  getClientName(clientType: ClientType): string {
    switch (clientType) {
      case 'openai':
        return 'OpenAI';
      case 'claude':
        return 'Claude (Anthropic)';
      case 'gemini':
        return 'Gemini (Google)';
      default:
        return 'Unknown';
    }
  }

  // === 私有检测方法 ===

  private detectByPath(pathname: string): ClientDetectionResult {
    const path = pathname.toLowerCase();

    // Gemini 原生路径
    if (path.includes('/v1beta/models') || path.includes('/v1beta/') || path.includes('generatecontent')) {
      return {
        clientType: 'gemini',
        confidence: 0.95,
        reason: 'gemini_native_path',
        detectedHeaders: [],
      };
    }

    // OpenAI 兼容路径
    if (path.includes('/v1/chat/completions') || path.includes('/v1/embeddings') || path.includes('/v1/models')) {
      return {
        clientType: 'openai',
        confidence: 0.85,
        reason: 'openai_compatible_path',
        detectedHeaders: [],
      };
    }

    // Claude 兼容路径
    if (path.includes('/v1/messages') || path.includes('/v1/complete')) {
      return {
        clientType: 'claude',
        confidence: 0.85,
        reason: 'claude_compatible_path',
        detectedHeaders: [],
      };
    }

    return {
      clientType: 'unknown',
      confidence: 0,
      reason: 'no_matching_path',
      detectedHeaders: [],
    };
  }

  private detectByHeaders(headers: Headers): ClientDetectionResult {
    const detectedHeaders: string[] = [];

    // 检查特定的客户端头
    const openaiHeaders = ['openai-organization', 'openai-project'];
    const claudeHeaders = ['anthropic-version', 'anthropic-beta'];
    const geminiHeaders = ['x-goog-api-key', 'x-goog-user-project'];

    let openaiScore = 0;
    let claudeScore = 0;
    let geminiScore = 0;

    // 检查 OpenAI 特征头
    for (const header of openaiHeaders) {
      if (headers.has(header)) {
        openaiScore += 0.4;
        detectedHeaders.push(header);
      }
    }

    // 检查 Claude 特征头
    for (const header of claudeHeaders) {
      if (headers.has(header)) {
        claudeScore += 0.4;
        detectedHeaders.push(header);
      }
    }

    // 检查 Gemini 特征头
    for (const header of geminiHeaders) {
      if (headers.has(header)) {
        geminiScore += 0.4;
        detectedHeaders.push(header);
      }
    }

    // 返回得分最高的客户端类型
    const maxScore = Math.max(openaiScore, claudeScore, geminiScore);
    
    if (maxScore > 0) {
      let clientType: ClientType;
      let reason: string;

      if (openaiScore === maxScore) {
        clientType = 'openai';
        reason = 'openai_specific_headers';
      } else if (claudeScore === maxScore) {
        clientType = 'claude';
        reason = 'claude_specific_headers';
      } else {
        clientType = 'gemini';
        reason = 'gemini_specific_headers';
      }

      return {
        clientType,
        confidence: Math.min(0.8, maxScore),
        reason,
        detectedHeaders,
      };
    }

    return {
      clientType: 'unknown',
      confidence: 0,
      reason: 'no_client_specific_headers',
      detectedHeaders: [],
    };
  }

  private detectByUserAgent(userAgent: string): ClientDetectionResult {
    const ua = userAgent.toLowerCase();

    // OpenAI 客户端特征
    if (ua.includes('openai') || ua.includes('chatgpt') || ua.includes('gpt')) {
      return {
        clientType: 'openai',
        confidence: 0.7,
        reason: 'openai_user_agent',
        detectedHeaders: ['user-agent'],
      };
    }

    // Claude 客户端特征
    if (ua.includes('claude') || ua.includes('anthropic')) {
      return {
        clientType: 'claude',
        confidence: 0.7,
        reason: 'claude_user_agent',
        detectedHeaders: ['user-agent'],
      };
    }

    // Gemini 客户端特征
    if (ua.includes('gemini') || ua.includes('bard') || ua.includes('google-ai')) {
      return {
        clientType: 'gemini',
        confidence: 0.7,
        reason: 'gemini_user_agent',
        detectedHeaders: ['user-agent'],
      };
    }

    // 常见的 HTTP 客户端库
    if (ua.includes('python') || ua.includes('requests') || ua.includes('urllib')) {
      return {
        clientType: 'unknown',
        confidence: 0.2,
        reason: 'python_client_detected',
        detectedHeaders: ['user-agent'],
      };
    }

    if (ua.includes('curl') || ua.includes('wget')) {
      return {
        clientType: 'unknown',
        confidence: 0.1,
        reason: 'command_line_tool',
        detectedHeaders: ['user-agent'],
      };
    }

    return {
      clientType: 'unknown',
      confidence: 0,
      reason: 'unknown_user_agent',
      detectedHeaders: [],
    };
  }

  private detectByAuthHeaders(headers: Headers): ClientDetectionResult {
    const authHeader = headers.get('authorization');
    const apiKeyHeader = headers.get('x-api-key');
    const googleHeader = headers.get('x-goog-api-key');

    // Gemini 使用 x-goog-api-key
    if (googleHeader) {
      return {
        clientType: 'gemini',
        confidence: 0.6,
        reason: 'gemini_auth_header',
        detectedHeaders: ['x-goog-api-key'],
      };
    }

    // Claude 使用 x-api-key
    if (apiKeyHeader && !authHeader) {
      return {
        clientType: 'claude',
        confidence: 0.5,
        reason: 'claude_auth_header',
        detectedHeaders: ['x-api-key'],
      };
    }

    // OpenAI 使用 Authorization: Bearer
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return {
        clientType: 'openai',
        confidence: 0.4,
        reason: 'openai_auth_header',
        detectedHeaders: ['authorization'],
      };
    }

    return {
      clientType: 'unknown',
      confidence: 0,
      reason: 'no_auth_headers',
      detectedHeaders: [],
    };
  }
}

/**
 * 全局客户端检测器实例
 */
let globalDetector: ClientDetector | null = null;

export function getGlobalDetector(): ClientDetector {
  if (!globalDetector) {
    globalDetector = new ClientDetector();
  }
  return globalDetector;
}

/**
 * 便捷函数：检测请求的客户端类型
 */
export function detectClientType(request: Request): ClientDetectionResult {
  return getGlobalDetector().detect(request);
}