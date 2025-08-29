/**
 * OpenAI聊天适配器
 * 处理OpenAI /v1/chat/completions API兼容性
 */
import { BaseAdapter, type AdapterContext, type AdapterResult, type StreamingAdapterResult } from '../base/adapter.js';
import { RequestBodyValidator } from '../base/validator.js';
import { log } from '../../utils/logger.js';
import { throwError } from '../base/errors.js';
import { OpenAITransformer } from './transformer.js';

/**
 * OpenAI聊天适配器
 * 处理OpenAI /v1/chat/completions API兼容性
 */
export class OpenAIChatAdapter extends BaseAdapter {
  constructor() {
    super('openai');
  }

  /**
   * 验证请求体
   */
  protected async validateRequest(context: AdapterContext): Promise<void> {
    const body = await RequestBodyValidator.validateCommonRequestBody(context.request);
    
    // OpenAI特定验证
    RequestBodyValidator.validateRequired(body.model, 'model');
    RequestBodyValidator.validateRequired(body.messages, 'messages');
    RequestBodyValidator.validateArrayLength(body.messages, 'messages', 1, 100);
    
    // 验证消息格式
    this.validateOpenAIMessages(body.messages);
    
    // 验证可选参数
    if (body.max_tokens !== undefined) {
      RequestBodyValidator.validateNumberRange(body.max_tokens, 'max_tokens', 1, 8192);
    }
    
    if (body.temperature !== undefined) {
      RequestBodyValidator.validateNumberRange(body.temperature, 'temperature', 0, 2);
    }
    
    if (body.top_p !== undefined) {
      RequestBodyValidator.validateNumberRange(body.top_p, 'top_p', 0, 1);
    }
    
    if (body.frequency_penalty !== undefined) {
      RequestBodyValidator.validateNumberRange(body.frequency_penalty, 'frequency_penalty', -2, 2);
    }
    
    if (body.presence_penalty !== undefined) {
      RequestBodyValidator.validateNumberRange(body.presence_penalty, 'presence_penalty', -2, 2);
    }
    
    if (body.logit_bias !== undefined) {
      this.validateLogitBias(body.logit_bias);
    }
  }

  /**
   * 转换请求格式
   */
  protected async transformRequest(context: AdapterContext): Promise<any> {
    try {
      const body = await RequestBodyValidator.validateCommonRequestBody(context.request);
      return OpenAITransformer.transformRequest(body, context);
    } catch (error) {
      log.error('Error transforming OpenAI request', error instanceof Error ? error : undefined);
      throwError.api('Failed to transform OpenAI request', 400, { originalError: error });
    }
  }

  /**
   * 转换响应格式
   */
  protected async transformResponse(response: any, context: AdapterContext): Promise<AdapterResult> {
    try {
      if (!response || typeof response !== 'object') {
        throwError.api('Invalid response format from OpenAI API');
      }

      if (!response.candidates || !Array.isArray(response.candidates)) {
        throwError.api('Invalid response candidates from OpenAI API');
      }

      const transformedResponse: AdapterResult = {
        data: {
          id: response.id || `openai-${Date.now()}`,
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
      log.error('Error transforming OpenAI response', error instanceof Error ? error : undefined);
      throwError.api('Failed to transform OpenAI response', 502, { originalError: error });
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

      // 转换流式响应为OpenAI格式
      return this.transformStreamingResponse(response, context);
    } catch (error) {
      log.error('Error creating OpenAI streaming response', error instanceof Error ? error : undefined);
      throwError.api('Failed to create OpenAI streaming response', 502, { originalError: error });
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
      const id = `openai-${Date.now()}`;
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
      log.error('Error transforming OpenAI streaming response', error instanceof Error ? error : undefined);
      throwError.api('Failed to transform OpenAI streaming response', 502, { originalError: error });
    }
    
    // 确保函数总是有返回值
    throw new Error('Unreachable code');
  }

  /**
   * 验证OpenAI消息格式
   */
  private validateOpenAIMessages(messages: any[]): void {
    messages.forEach((message, index) => {
      const fieldPath = `messages[${index}]`;
      
      if (!message || typeof message !== 'object') {
        throwError.validation(`${fieldPath} must be an object`);
      }
      
      RequestBodyValidator.validateRequired(message.role, `${fieldPath}.role`);
      RequestBodyValidator.validateRequired(message.content, `${fieldPath}.content`);
      
      // 验证role值
      RequestBodyValidator.validateEnum(message.role, `${fieldPath}.role`, ['system', 'user', 'assistant', 'function', 'tool']);
      
      // 验证content格式
      if (typeof message.content === 'string') {
        RequestBodyValidator.validateStringLength(message.content, `${fieldPath}.content`, 1, 32000);
      } else if (Array.isArray(message.content)) {
        RequestBodyValidator.validateArrayLength(message.content, `${fieldPath}.content`, 1, 20);
                 message.content.forEach((item: any, itemIndex: number) => {
          const itemPath = `${fieldPath}.content[${itemIndex}]`;
          if (!item || typeof item !== 'object') {
            throwError.validation(`${itemPath} must be an object`);
          }
          RequestBodyValidator.validateRequired(item.type, `${itemPath}.type`);
          RequestBodyValidator.validateEnum(item.type, `${itemPath}.type`, ['text', 'image_url']);
          
          if (item.type === 'text') {
            RequestBodyValidator.validateRequired(item.text, `${itemPath}.text`);
            RequestBodyValidator.validateStringLength(item.text, `${itemPath}.text`, 1, 32000);
          } else if (item.type === 'image_url') {
            RequestBodyValidator.validateRequired(item.image_url?.url, `${itemPath}.image_url.url`);
          }
        });
      } else {
        throwError.validation(`${fieldPath}.content must be a string or array`);
      }
    });
  }

  /**
   * 验证logit_bias参数
   */
  private validateLogitBias(logitBias: any): void {
    if (typeof logitBias !== 'object') {
      throwError.validation('logit_bias must be an object');
    }
    
         for (const [, value] of Object.entries(logitBias)) {
      if (typeof value !== 'number' || value < -100 || value > 100) {
        throwError.validation('logit_bias values must be numbers between -100 and 100');
      }
    }
  }
}