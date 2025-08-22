/**
 * OpenAI聊天完成适配器
 * 处理OpenAI /v1/chat/completions API兼容性
 */
import { BaseAdapter, type AdapterContext, type AdapterResult, type StreamingAdapterResult } from '@/adapters/base/adapter.js';
import { RequestBodyValidator } from '@/adapters/base/validator.js';
import { AdapterErrorHandler } from '@/adapters/base/errors.js';
import { OpenAITransformer, type OpenAIChatRequest } from './transformer.js';
import { API_CONFIG } from '@/utils/constants.js';
import { log } from '@/utils/logger.js';

/**
 * OpenAI聊天完成适配器
 */
export class OpenAIChatAdapter extends BaseAdapter {
  constructor() {
    super('openai');
  }

  /**
   * 验证OpenAI聊天完成请求
   */
  protected async validateRequest(context: AdapterContext): Promise<void> {
    const body = await RequestBodyValidator.validateCommonRequestBody(context.request) as OpenAIChatRequest;

    // OpenAI特定验证
    RequestBodyValidator.validateRequired(body.model, 'model');
    RequestBodyValidator.validateRequired(body.messages, 'messages');
    RequestBodyValidator.validateArrayLength(body.messages, 'messages', 1, 100);

    // 验证消息格式
    RequestBodyValidator.validateMessages(body.messages);

    // 验证模型参数
    RequestBodyValidator.validateModelParameters(body);

    // OpenAI特定参数验证
    if (body.n !== undefined) {
      RequestBodyValidator.validateNumberRange(body.n, 'n', 1, 10);
    }

    if (body.presence_penalty !== undefined) {
      RequestBodyValidator.validateNumberRange(body.presence_penalty, 'presence_penalty', -2, 2);
    }

    if (body.frequency_penalty !== undefined) {
      RequestBodyValidator.validateNumberRange(body.frequency_penalty, 'frequency_penalty', -2, 2);
    }

    if (body.logit_bias !== undefined && typeof body.logit_bias === 'object') {
      // 验证logit_bias格式
      Object.values(body.logit_bias).forEach(value => {
        if (typeof value !== 'number' || value < -100 || value > 100) {
          throw new Error('logit_bias values must be numbers between -100 and 100');
        }
      });
    }

    // 检查是否为流式请求
    if (body.stream) {
      context.context.set('isStreaming', true);
    }

    // 将验证后的请求体存储到上下文
    context.context.set('requestBody', body);
  }

  /**
   * 转换OpenAI请求为Gemini格式
   */
  protected async transformRequest(context: AdapterContext): Promise<any> {
    const openaiRequest = context.context.get('requestBody') as OpenAIChatRequest;
    
    try {
      return OpenAITransformer.transformRequest(openaiRequest, context);
    } catch (error) {
      AdapterErrorHandler.handleTransformError(error as Error, 'openai-to-gemini');
    }
  }

  /**
   * 转换Gemini响应为OpenAI格式
   */
  protected async transformResponse(response: any, context: AdapterContext): Promise<AdapterResult> {
    try {
      const openaiResponse = OpenAITransformer.transformResponse(response, context);
      
      // 提取token使用信息用于指标记录
      if (openaiResponse.usage) {
        context.context.set('tokenUsage', {
          promptTokens: openaiResponse.usage.prompt_tokens,
          completionTokens: openaiResponse.usage.completion_tokens,
          totalTokens: openaiResponse.usage.total_tokens,
        });
      }

      return {
        data: openaiResponse,
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      };
    } catch (error) {
      AdapterErrorHandler.handleTransformError(error as Error, 'gemini-to-openai');
    }
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
        body: JSON.stringify(transformedRequest),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as any;
        AdapterErrorHandler.handleGeminiError(errorData, context.selectedKey);
      }

      if (!response.body) {
        throw new Error('No response body for streaming');
      }

      // 创建OpenAI格式的流式转换器
      const transformStream = this.createOpenAIStreamTransform(context);

      return {
        stream: response.body.pipeThrough(transformStream),
        statusCode: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      };
    } catch (error) {
      AdapterErrorHandler.handleStreamingError(error as Error, context.selectedKey);
    }
  }

  /**
   * 构建Gemini API URL
   */
  protected buildGeminiApiUrl(_request: any, context: AdapterContext): string {
    const model = context.context.get('geminiModel') || 'gemini-2.5-pro';
    return `${API_CONFIG.GEMINI_BASE_URL}/${API_CONFIG.GEMINI_API_VERSION}/models/${model}:generateContent`;
  }

  /**
   * 构建流式请求URL
   */
  private buildStreamingUrl(_request: any, context: AdapterContext): string {
    const model = context.context.get('geminiModel') || 'gemini-2.5-pro';
    return `${API_CONFIG.GEMINI_BASE_URL}/${API_CONFIG.GEMINI_API_VERSION}/models/${model}:streamGenerateContent`;
  }

  /**
   * 从上下文提取模型信息
   */
  protected extractModelFromContext(context: AdapterContext): string {
    const openaiRequest = context.context.get('requestBody') as OpenAIChatRequest;
    return openaiRequest?.model || 'gpt-3.5-turbo';
  }

  /**
   * 创建OpenAI格式的流式转换器
   */
  private createOpenAIStreamTransform(context: AdapterContext): TransformStream {
    return new TransformStream({
      start(_controller) {
        // 流开始时无需特殊处理
      },
      
      transform(chunk, controller) {
        try {
          const text = new TextDecoder().decode(chunk);
          const lines = text.split('\n');

          for (const line of lines) {
            if (line.trim() === '') continue;

            if (line.startsWith('data: ')) {
              const jsonStr = line.substring(6);
              
              if (jsonStr.trim() === '[DONE]') {
                controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                return;
              }

              try {
                const geminiData = JSON.parse(jsonStr);
                // 转换为OpenAI格式
                const openaiChunk = OpenAITransformer.transformStreamChunk(geminiData, context);
                
                if (openaiChunk) {
                  controller.enqueue(new TextEncoder().encode(openaiChunk));
                }
              } catch (parseError) {
                log.warn('Failed to parse streaming data:', { error: parseError });
              }
            }
          }
        } catch (error) {
          log.error('Stream transform error:', error as Error);
          controller.error(error);
        }
      },

      flush(controller) {
        // 确保流正确结束
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
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
      'tools',
      'vision', // 通过Gemini 2.5支持
    ];
    return supportedFeatures.includes(feature);
  }

  /**
   * 检查请求是否需要特殊处理
   */
  requiresSpecialHandling(context: AdapterContext): boolean {
    const body = context.context.get('requestBody') as OpenAIChatRequest;
    
    // 函数调用或工具使用需要特殊处理
    return !!(body.functions || body.tools || body.function_call || body.tool_choice);
  }
}