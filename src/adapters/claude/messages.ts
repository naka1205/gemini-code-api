/**
 * Claude消息适配器
 * 处理Claude /v1/messages API兼容性
 */
import { BaseAdapter, type AdapterContext, type AdapterResult, type StreamingAdapterResult } from '../base/adapter.js';
import { RequestBodyValidator } from '../base/validator.js';
import { log } from '../../utils/logger.js';
import { throwError } from '../base/errors.js';
import { ClaudeTransformer, type ClaudeRequest } from './transformer.js';

/**
 * Claude消息适配器
 * 处理Claude /v1/messages API兼容性
 */
export class ClaudeMessageAdapter extends BaseAdapter {
  constructor() {
    super('claude');
  }

  /**
   * 验证请求体
   */
  protected async validateRequest(context: AdapterContext): Promise<void> {
    const body = await RequestBodyValidator.validateCommonRequestBody(context.request) as ClaudeRequest;

    // Claude特定验证
    RequestBodyValidator.validateRequired(body.model, 'model');
    RequestBodyValidator.validateRequired(body.max_tokens, 'max_tokens');
    RequestBodyValidator.validateRequired(body.messages, 'messages');

    // 验证max_tokens
    RequestBodyValidator.validateNumberRange(body.max_tokens, 'max_tokens', 1, 8192);

    // 验证消息格式
    this.validateClaudeMessages(body.messages);

    // 验证可选参数
    if (body.temperature !== undefined) {
      RequestBodyValidator.validateNumberRange(body.temperature, 'temperature', 0, 1);
    }

    if (body.top_p !== undefined) {
      RequestBodyValidator.validateNumberRange(body.top_p, 'top_p', 0, 1);
    }

    if (body.top_k !== undefined) {
      RequestBodyValidator.validateNumberRange(body.top_k, 'top_k', 1, 40);
    }

    if (body.stop_sequences !== undefined) {
      RequestBodyValidator.validateArrayLength(body.stop_sequences, 'stop_sequences', 0, 4);
      body.stop_sequences.forEach((seq: string, index: number) => {
        RequestBodyValidator.validateStringLength(seq, `stop_sequences[${index}]`, 1, 64);
      });
    }

    if (body.system !== undefined) {
      RequestBodyValidator.validateStringLength(body.system, 'system', 0, 32000);
    }

    // 验证工具配置
    if (body.tools !== undefined) {
      RequestBodyValidator.validateArrayLength(body.tools, 'tools', 0, 128);
      body.tools.forEach((tool, index) => {
        this.validateClaudeTool(tool, `tools[${index}]`);
      });
    }
  }

  /**
   * 转换请求格式
   */
  protected async transformRequest(context: AdapterContext): Promise<any> {
    try {
      const claudeRequest = await RequestBodyValidator.validateCommonRequestBody(context.request) as ClaudeRequest;
      return ClaudeTransformer.transformRequest(claudeRequest, context);
    } catch (error) {
      log.error('Error transforming Claude request', error instanceof Error ? error : undefined);
      throwError.api('Failed to transform Claude request', 400, { originalError: error });
    }
  }

  /**
   * 转换响应格式
   */
  protected async transformResponse(response: any, context: AdapterContext): Promise<AdapterResult> {
    try {
      // 验证响应格式
      if (!response || typeof response !== 'object') {
        throwError.api('Invalid response format from Claude API');
      }

      if (!response.content || !Array.isArray(response.content)) {
        throwError.api('Invalid response content from Claude API');
      }

      // 转换响应格式
      const transformedResponse: AdapterResult = {
        data: {
          id: response.id || `claude-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: context.clientType,
          choices: response.content.map((content: any, index: number) => ({
            index,
            message: {
              role: 'assistant',
              content: content.text || '',
            },
            finish_reason: 'stop',
          })),
          usage: response.usage ? {
            prompt_tokens: response.usage.input_tokens || 0,
            completion_tokens: response.usage.output_tokens || 0,
            total_tokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
          } : undefined,
        },
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      return transformedResponse;
    } catch (error) {
      log.error('Error transforming Claude response', error instanceof Error ? error : undefined);
      throwError.api('Failed to transform Claude response', 502, { originalError: error });
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

      // 转换流式响应为Claude格式
      return this.transformStreamingResponse(response, context);
    } catch (error) {
      log.error('Error creating Claude streaming response', error instanceof Error ? error : undefined);
      throwError.api('Failed to create Claude streaming response', 502, { originalError: error });
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
       const id = `claude-${Date.now()}`;
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
                    if (parsed.type === 'content_block_delta') {
                      const transformed = {
                        id,
                        object: 'chat.completion.chunk',
                        created: Math.floor(Date.now() / 1000),
                        model: context.clientType,
                        choices: [{
                          index: 0,
                          delta: {
                            content: parsed.delta?.text || '',
                          },
                          finish_reason: null,
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
      log.error('Error transforming Claude streaming response', error instanceof Error ? error : undefined);
      throwError.api('Failed to transform Claude streaming response', 502, { originalError: error });
    }
    
    // 确保函数总是有返回值
    throw new Error('Unreachable code');
  }

  /**
   * 验证Claude消息格式
   */
  private validateClaudeMessages(messages: any[]): void {
    if (!Array.isArray(messages) || messages.length === 0) {
      throwError.validation('Messages must be a non-empty array');
    }

    messages.forEach((message, index) => {
      const fieldPath = `messages[${index}]`;
      
      if (!message || typeof message !== 'object') {
        throwError.validation(`${fieldPath} must be an object`);
      }

      RequestBodyValidator.validateRequired(message.role, `${fieldPath}.role`);
      RequestBodyValidator.validateRequired(message.content, `${fieldPath}.content`);

      // 验证role值
      RequestBodyValidator.validateEnum(message.role, `${fieldPath}.role`, ['user', 'assistant']);

      // Claude要求交替的用户和助手消息
      if (index > 0) {
        const prevMessage = messages[index - 1];
        if (message.role === prevMessage.role) {
          throwError.validation(`${fieldPath}.role: messages must alternate between 'user' and 'assistant'`);
        }
      }

      // 第一条消息必须是用户消息
      if (index === 0 && message.role !== 'user') {
        throwError.validation('First message must have role "user"');
      }

      // 最后一条消息必须是用户消息
      if (index === messages.length - 1 && message.role !== 'user') {
        throwError.validation('Last message must have role "user"');
      }

      // 验证消息内容
      this.validateMessageContent(message.content, `${fieldPath}.content`);
    });
  }

  /**
   * 验证消息内容
   */
  private validateMessageContent(content: any, fieldPath: string): void {
    if (typeof content === 'string') {
      RequestBodyValidator.validateStringLength(content, fieldPath, 1, 32000);
    } else if (Array.isArray(content)) {
      RequestBodyValidator.validateArrayLength(content, fieldPath, 1, 20);
      
      content.forEach((item, index) => {
        const itemPath = `${fieldPath}[${index}]`;
        
        if (!item || typeof item !== 'object') {
          throwError.validation(`${itemPath} must be an object`);
        }

        RequestBodyValidator.validateRequired(item.type, `${itemPath}.type`);
        RequestBodyValidator.validateEnum(item.type, `${itemPath}.type`, ['text', 'image']);

        if (item.type === 'text') {
          RequestBodyValidator.validateRequired(item.text, `${itemPath}.text`);
          RequestBodyValidator.validateStringLength(item.text, `${itemPath}.text`, 1, 32000);
        } else if (item.type === 'image') {
          RequestBodyValidator.validateRequired(item.source, `${itemPath}.source`);
          // 这里可以添加更多图片格式验证
        }
      });
    } else {
      throwError.validation(`${fieldPath} must be a string or array`);
    }
  }

  /**
   * 验证Claude工具定义
   */
  private validateClaudeTool(tool: any, fieldPath: string): void {
    if (!tool || typeof tool !== 'object') {
      throwError.validation(`${fieldPath} must be an object`);
    }

    RequestBodyValidator.validateRequired(tool.name, `${fieldPath}.name`);
    RequestBodyValidator.validateStringLength(tool.name, `${fieldPath}.name`, 1, 64);

    if (tool.description) {
      RequestBodyValidator.validateStringLength(tool.description, `${fieldPath}.description`, 0, 1000);
    }

    if (tool.input_schema) {
      // 这里可以添加JSON Schema验证
      if (typeof tool.input_schema !== 'object') {
        throwError.validation(`${fieldPath}.input_schema must be an object`);
      }
    }
  }
}