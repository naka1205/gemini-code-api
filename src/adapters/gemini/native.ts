/**
 * Gemini原生适配器
 * 直接使用Gemini API格式，无需转换
 */
import { BaseAdapter, type AdapterContext, type AdapterResult, type StreamingAdapterResult } from '../base/adapter.js';
import { RequestBodyValidator } from '../base/validator.js';
import { log } from '../../utils/logger.js';
import { throwError } from '../base/errors.js';

/**
 * Gemini原生适配器
 * 直接使用Gemini API格式，无需转换
 */
export class GeminiNativeAdapter extends BaseAdapter {
  constructor() {
    super('gemini');
  }

  /**
   * 验证请求体
   */
  protected async validateRequest(context: AdapterContext): Promise<void> {
    const body = await RequestBodyValidator.validateCommonRequestBody(context.request);
    
    // Gemini特定验证
    RequestBodyValidator.validateRequired(body.contents, 'contents');
    RequestBodyValidator.validateArrayLength(body.contents, 'contents', 1, 100);
    
    // 验证生成配置
    if (body.generationConfig) {
      const config = body.generationConfig;
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
    }
  }

  /**
   * 转换请求格式
   */
  protected async transformRequest(context: AdapterContext): Promise<any> {
    try {
      const body = await RequestBodyValidator.validateCommonRequestBody(context.request);
      return body; // Gemini原生无需转换
    } catch (error) {
      log.error('Error transforming Gemini request', error instanceof Error ? error : undefined);
      throwError.api('Failed to transform Gemini request', 400, { originalError: error });
    }
  }

  /**
   * 转换响应格式
   */
  protected async transformResponse(response: any, context: AdapterContext): Promise<AdapterResult> {
    try {
      if (!response || typeof response !== 'object') {
        throwError.api('Invalid response format from Gemini API');
      }

      if (!response.candidates || !Array.isArray(response.candidates)) {
        throwError.api('Invalid response candidates from Gemini API');
      }

      const transformedResponse: AdapterResult = {
        data: {
          id: response.id || `gemini-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: context.clientType,
          choices: response.candidates.map((candidate: any, index: number) => ({
            index,
            message: {
              role: 'assistant',
              content: candidate.content?.parts?.[0]?.text || '',
            },
            finish_reason: candidate.finishReason || 'stop',
          })),
          usage: response.usageMetadata ? {
            prompt_tokens: response.usageMetadata.promptTokenCount || 0,
            completion_tokens: response.usageMetadata.candidatesTokenCount || 0,
            total_tokens: (response.usageMetadata.promptTokenCount || 0) + (response.usageMetadata.candidatesTokenCount || 0),
          } : undefined,
        },
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      return transformedResponse;
    } catch (error) {
      log.error('Error transforming Gemini response', error instanceof Error ? error : undefined);
      throwError.api('Failed to transform Gemini response', 502, { originalError: error });
    }
    
    // 确保函数总是有返回值
    throw new Error('Unreachable code');
  }

  /**
   * 创建流式响应
   */
  protected async createStreamingResponse(
    transformedRequest: any,
    context: AdapterContext
  ): Promise<StreamingAdapterResult> {
    try {
      if (!context.selectedKey) {
        throwError.api('No API key selected');
      }

      // 调用Gemini API获取流式响应
      const response = await this.callGeminiApi(transformedRequest, context);
      
      if (!response || !response.body) {
        throwError.api('No response body for streaming');
      }

      // 转换流式响应为Gemini格式
      return this.transformStreamingResponse(response, context);
    } catch (error) {
      log.error('Error creating Gemini streaming response', error instanceof Error ? error : undefined);
      throwError.api('Failed to create Gemini streaming response', 502, { originalError: error });
    }
    
    // 确保函数总是有返回值
    throw new Error('Unreachable code');
  }

  /**
   * 转换流式响应
   */
  protected async transformStreamingResponse(
    response: any,
    context: AdapterContext
  ): Promise<StreamingAdapterResult> {
    try {
      if (!response || !response.body) {
        throwError.api('No response body for streaming');
      }

      // 创建流式转换器
      const id = `gemini-${Date.now()}`;
      let buffer = "";
      const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB限制

      const transformStream = response.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new TransformStream({
          transform(chunk: string, controller) {
            buffer += chunk;
            
                         // 检查buffer大小，防止内存泄漏
             if (buffer.length > MAX_BUFFER_SIZE) {
               log.error("Buffer size exceeded limit, clearing buffer to prevent memory leak", {
                 bufferLength: buffer.length,
                 maxSize: MAX_BUFFER_SIZE
               } as any);
              buffer = buffer.substring(buffer.length - MAX_BUFFER_SIZE / 2);
            }
            
            // 处理SSE格式
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.substring(6);
                if (data === '[DONE]') {
                  controller.enqueue('data: [DONE]\n\n');
                } else {
                  try {
                    const parsed = JSON.parse(data);
                    if (parsed.candidates && parsed.candidates.length > 0) {
                      const candidate = parsed.candidates[0];
                      const transformed = {
                        id,
                        object: 'chat.completion.chunk',
                        created: Math.floor(Date.now() / 1000),
                        model: context.clientType,
                        choices: [{
                          index: 0,
                          delta: {
                            content: candidate.content?.parts?.[0]?.text || '',
                          },
                          finish_reason: candidate.finishReason || null,
                        }],
                      };
                      controller.enqueue(`data: ${JSON.stringify(transformed)}\n\n`);
                    }
                  } catch (err) {
                    log.warn('Error parsing streaming data', { data, error: err });
                  }
                }
              }
            }
          },
                     flush() {
             if (buffer) {
               log.warn('Unprocessed buffer data', { bufferLength: buffer.length });
             }
             buffer = "";
           }
        }))
        .pipeThrough(new TextEncoderStream());

      return {
        stream: transformStream,
        statusCode: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      };
    } catch (error) {
      log.error('Error transforming Gemini streaming response', error instanceof Error ? error : undefined);
      throwError.api('Failed to transform Gemini streaming response', 502, { originalError: error });
    }
    
    // 确保函数总是有返回值
    throw new Error('Unreachable code');
  }
}