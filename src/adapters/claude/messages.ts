/**
 * Claude消息适配器
 * 处理Claude /v1/messages API兼容性
 */
import { BaseAdapter, type AdapterContext, type AdapterResult, type StreamingAdapterResult } from '../base/adapter.js';
import { RequestBodyValidator } from '../base/validator.js';
import { AdapterErrorHandler } from '../base/errors.js';
import { ClaudeTransformer, type ClaudeRequest } from './transformer.js';
import { createClaudeStreamTransformer } from './streaming.js';
import { API_CONFIG } from '../../utils/constants.js';

/**
 * Claude消息适配器
 */
export class ClaudeMessageAdapter extends BaseAdapter {
  constructor() {
    super('claude');
  }

  /**
   * 验证Claude消息请求
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
    RequestBodyValidator.validateArrayLength(body.messages, 'messages', 1, 100);
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

    // 检查是否为流式请求
    if (body.stream) {
      context.context.set('isStreaming', true);
    }

    // 将验证后的请求体存储到上下文
    context.context.set('requestBody', body);
  }

  /**
   * 转换Claude请求为Gemini格式
   */
  protected async transformRequest(context: AdapterContext): Promise<any> {
    const claudeRequest = context.context.get('requestBody') as ClaudeRequest;
    
    try {
      return ClaudeTransformer.transformRequest(claudeRequest, context);
    } catch (error) {
      AdapterErrorHandler.handleTransformError(error as Error, 'claude-to-gemini');
    }
  }

  /**
   * 转换Gemini响应为Claude格式
   */
  protected async transformResponse(response: any, context: AdapterContext): Promise<AdapterResult> {
    try {
      const claudeResponse = ClaudeTransformer.transformResponse(response, context);
      
      // 提取token使用信息用于指标记录
      if (claudeResponse.usage) {
        context.context.set('tokenUsage', {
          promptTokens: claudeResponse.usage.input_tokens,
          completionTokens: claudeResponse.usage.output_tokens,
          totalTokens: claudeResponse.usage.input_tokens + claudeResponse.usage.output_tokens,
        });
      }

      return {
        data: claudeResponse,
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      };
    } catch (error) {
      AdapterErrorHandler.handleTransformError(error as Error, 'gemini-to-claude');
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

      // 创建Claude格式的流式转换器
      const transformStream = this.createClaudeStreamTransform(context);

      return {
        stream: response.body.pipeThrough(transformStream),
        statusCode: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version',
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
    // 【调试】尝试使用 v1 API 端点
    return `${API_CONFIG.GEMINI_BASE_URL}/v1/models/${model}:generateContent`;
  }

  /**
   * 构建流式请求URL
   */
  private buildStreamingUrl(_request: any, context: AdapterContext): string {
    const model = context.context.get('geminiModel') || 'gemini-2.5-pro';
    // 【调试】尝试使用 v1 API 端点
    return `${API_CONFIG.GEMINI_BASE_URL}/v1/models/${model}:streamGenerateContent`;
  }

  /**
   * 从上下文提取模型信息
   */
  protected extractModelFromContext(context: AdapterContext): string {
    const claudeRequest = context.context.get('requestBody') as ClaudeRequest;
    return claudeRequest?.model || 'claude-3-sonnet-20240229';
  }

  /**
   * 获取支持的功能
   */
  supportsFeature(feature: string): boolean {
    const supportedFeatures = [
      'chat',
      'completion',
      'streaming',
      'system-messages',
      'vision', // 通过Gemini 2.5支持
    ];
    return supportedFeatures.includes(feature);
  }

  // === 私有辅助方法 ===

  /**
   * 验证Claude消息格式
   */
  private validateClaudeMessages(messages: any[]): void {
    let lastRole: string | null = null;

    messages.forEach((message, index) => {
      const fieldPath = `messages[${index}]`;
      
      if (!message || typeof message !== 'object') {
        throw new Error(`${fieldPath} must be an object`);
      }

      RequestBodyValidator.validateRequired(message.role, `${fieldPath}.role`);
      RequestBodyValidator.validateRequired(message.content, `${fieldPath}.content`);

      // 验证role值
      RequestBodyValidator.validateEnum(message.role, `${fieldPath}.role`, ['user', 'assistant']);

      // Claude要求交替的用户和助手消息
      if (lastRole === message.role) {
        throw new Error(`${fieldPath}.role: messages must alternate between 'user' and 'assistant'`);
      }

      // 第一条消息必须是user
      if (index === 0 && message.role !== 'user') {
        throw new Error('First message must have role "user"');
      }

      // 验证content格式
      this.validateMessageContent(message.content, `${fieldPath}.content`);

      lastRole = message.role;
    });

    // 最后一条消息必须是user
    if (messages.length > 0 && messages[messages.length - 1].role !== 'user') {
      throw new Error('Last message must have role "user"');
    }
  }

  /**
   * 验证消息内容格式
   */
  private validateMessageContent(content: any, fieldPath: string): void {
    if (typeof content === 'string') {
      RequestBodyValidator.validateStringLength(content, fieldPath, 1, 32000);
    } else if (Array.isArray(content)) {
      RequestBodyValidator.validateArrayLength(content, fieldPath, 1, 20);
      
      content.forEach((item, index) => {
        const itemPath = `${fieldPath}[${index}]`;
        
        if (!item || typeof item !== 'object') {
          throw new Error(`${itemPath} must be an object`);
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
      throw new Error(`${fieldPath} must be a string or array`);
    }
  }

  /**
   * 创建Claude格式的流式转换器
   */
  private createClaudeStreamTransform(context: AdapterContext): TransformStream {
    const model = this.extractModelFromContext(context);
    return createClaudeStreamTransformer(model, { emitPrelude: true });
  }
}