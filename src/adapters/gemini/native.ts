/**
 * Gemini原生适配器
 * 最简单的适配器，直接透传Gemini API请求
 */
import { log } from '../../utils/logger.js';
import { BaseAdapter, type AdapterContext, type AdapterResult, type StreamingAdapterResult } from '../base/adapter.js';
import { RequestBodyValidator } from '../base/validator.js';
import { AdapterErrorHandler } from '../base/errors.js';
import { API_CONFIG } from '../../utils/constants.js';

/**
 * Gemini原生适配器类
 */
export class GeminiNativeAdapter extends BaseAdapter {
  constructor() {
    super('gemini');
  }

  /**
   * 验证Gemini原生请求
   */
  protected async validateRequest(context: AdapterContext): Promise<void> {
    const body = await RequestBodyValidator.validateCommonRequestBody(context.request);

    // Gemini API特定验证
    if (body.contents) {
      RequestBodyValidator.validateRequired(body.contents, 'contents');
      RequestBodyValidator.validateArrayLength(body.contents, 'contents', 1);
      
      // 验证每个content项
      body.contents.forEach((content: any, index: number) => {
        const fieldPath = `contents[${index}]`;
        
        if (content.parts) {
          RequestBodyValidator.validateRequired(content.parts, `${fieldPath}.parts`);
          RequestBodyValidator.validateArrayLength(content.parts, `${fieldPath}.parts`, 1);
        }
      });
    }

    // 验证生成配置（如果存在）
    if (body.generationConfig) {
      this.validateGenerationConfig(body.generationConfig);
    }

    // 将验证后的body存储到上下文
    context.context.set('requestBody', body);
  }

  /**
   * 转换请求格式（Gemini原生无需转换）
   */
  protected async transformRequest(context: AdapterContext): Promise<any> {
    const body = context.context.get('requestBody');
    
    // 原生Gemini请求无需转换，直接返回
    return body;
  }

  /**
   * 转换响应格式（Gemini原生无需转换）
   */
  protected async transformResponse(response: any, context: AdapterContext): Promise<AdapterResult> {
    // 验证响应结构
    AdapterErrorHandler.validateResponse(response, ['candidates']);

    // 提取token使用信息（如果有）
    const tokenUsage = this.extractTokenUsage(response);

    // 存储到上下文用于日志记录
    if (tokenUsage) {
      context.context.set('tokenUsage', tokenUsage);
    }

    return {
      data: response,
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    };
  }

  /**
   * 创建流式响应
   */
  protected async createStreamingResponse(
    transformedRequest: any,
    context: AdapterContext
  ): Promise<StreamingAdapterResult> {
    if (!context.selectedKey) {
      throw new Error('No API key selected');
    }

    // 构建流式请求URL
    const url = this.buildStreamingUrl(transformedRequest, context);
    const headers = this.buildGeminiHeaders(context.selectedKey, context);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...transformedRequest,
          // 确保启用流式响应
          generationConfig: {
            ...transformedRequest.generationConfig,
            // Gemini原生流式参数
          }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as any;
        AdapterErrorHandler.handleGeminiError(errorData, context.selectedKey);
      }

      if (!response.body) {
        throw new Error('No response body for streaming');
      }

      // 创建转换流，处理Gemini的流式响应格式
      const transformStream = this.createGeminiStreamTransform();

      return {
        stream: response.body.pipeThrough(transformStream),
        statusCode: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      };
    } catch (error) {
      AdapterErrorHandler.handleStreamingError(error as Error, context.selectedKey);
    }
  }

  /**
   * 构建Gemini API URL
   */
  protected buildGeminiApiUrl(request: any, _context: AdapterContext): string {
    // 从请求中提取模型信息
    const model = this.extractModelFromRequest(request);
    return `${API_CONFIG.GEMINI_BASE_URL}/${API_CONFIG.GEMINI_API_VERSION}/models/${model}:generateContent`;
  }

  /**
   * 构建流式请求URL
   */
  private buildStreamingUrl(request: any, _context: AdapterContext): string {
    const model = this.extractModelFromRequest(request);
    return `${API_CONFIG.GEMINI_BASE_URL}/${API_CONFIG.GEMINI_API_VERSION}/models/${model}:streamGenerateContent`;
  }

  /**
   * 从请求中提取模型名称
   */
  protected extractModelFromContext(context: AdapterContext): string {
    const body = context.context.get('requestBody');
    return this.extractModelFromRequest(body) || 'gemini-2.5-pro';
  }

  /**
   * 从请求对象中提取模型
   */
  private extractModelFromRequest(request: any): string {
    // Gemini原生请求中模型通常在URL中指定，而不是在请求体中
    // 默认使用gemini-2.5-pro，实际实现中可以从URL路径参数中提取
    return request?.model || 'gemini-2.5-pro';
  }

  /**
   * 验证生成配置
   */
  private validateGenerationConfig(config: any): void {
    if (config.temperature !== undefined) {
      RequestBodyValidator.validateNumberRange(config.temperature, 'generationConfig.temperature', 0, 2);
    }

    if (config.topP !== undefined) {
      RequestBodyValidator.validateNumberRange(config.topP, 'generationConfig.topP', 0, 1);
    }

    if (config.topK !== undefined) {
      RequestBodyValidator.validateNumberRange(config.topK, 'generationConfig.topK', 1, 40);
    }

    if (config.maxOutputTokens !== undefined) {
      RequestBodyValidator.validateNumberRange(config.maxOutputTokens, 'generationConfig.maxOutputTokens', 1, 8192);
    }

    if (config.stopSequences !== undefined) {
      RequestBodyValidator.validateArrayLength(config.stopSequences, 'generationConfig.stopSequences', 0, 5);
    }
  }

  /**
   * 提取token使用信息
   */
  private extractTokenUsage(response: any): any {
    if (response.usageMetadata) {
      return {
        promptTokens: response.usageMetadata.promptTokenCount,
        completionTokens: response.usageMetadata.candidatesTokenCount,
        totalTokens: response.usageMetadata.totalTokenCount,
      };
    }
    return null;
  }

  /**
   * 创建Gemini流式响应转换器
   */
  private createGeminiStreamTransform(): TransformStream {
    return new TransformStream({
      start() {
        // 流开始时的初始化
      },
      
      transform(chunk, controller) {
        try {
          const text = new TextDecoder().decode(chunk);
          const lines = text.split('\n');

          for (const line of lines) {
            if (line.trim() === '') continue;

            // Gemini流式响应通常以data: 开头
            if (line.startsWith('data: ')) {
              const jsonStr = line.substring(6);
              if (jsonStr.trim() === '[DONE]') {
                controller.terminate();
                return;
              }

              try {
                JSON.parse(jsonStr); // 验证JSON格式
                // 直接转发Gemini的原生格式
                controller.enqueue(new TextEncoder().encode(`data: ${jsonStr}\n\n`));
              } catch (parseError) {
                // 忽略解析错误，可能是不完整的数据块
                log.warn('Failed to parse streaming data:', { error: parseError });
              }
            }
          }
        } catch (error) {
          log.error('Transform error:', error as Error);
          controller.error(error);
        }
      },

      flush() {
        // 流结束时的清理
      }
    });
  }

  /**
   * 获取支持的功能
   */
  supportsFeature(feature: string): boolean {
    const supportedFeatures = [
      'chat',
      'completion', 
      'streaming',
      'function-calling',
      'vision',
      'multimodal'
    ];
    return supportedFeatures.includes(feature);
  }
}