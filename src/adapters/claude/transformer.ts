/**
 * Claude兼容适配器 - 转换器
 * 将Claude格式请求转换为Gemini格式，并将响应转换回Claude格式
 */
import { log } from '../../utils/logger.js';
import type { AdapterContext } from '../base/adapter.js';
import { AdapterErrorHandler } from '../base/errors.js';
import { MODEL_MAPPINGS } from '../../utils/constants.js';

/**
 * Claude消息格式
 */
export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | Array<{
    type: 'text' | 'image';
    text?: string;
    source?: {
      type: string;
      media_type: string;
      data: string;
    };
  }>;
}

/**
 * Claude请求格式
 */
export interface ClaudeRequest {
  model: string;
  max_tokens: number;
  messages: ClaudeMessage[];
  system?: string;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  metadata?: {
    user_id?: string;
  };
}

/**
 * Claude响应格式
 */
export interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence';
  stop_sequence?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Claude流式响应事件
 */
export interface ClaudeStreamEvent {
  type: 'message_start' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_delta' | 'message_stop';
  message?: Partial<ClaudeResponse>;
  content_block?: {
    type: 'text';
    text: string;
  };
  delta?: {
    type: 'text_delta';
    text: string;
  };
  usage?: {
    output_tokens: number;
  };
}

/**
 * Claude请求转换器
 */
export class ClaudeTransformer {
  /**
   * 将Claude请求转换为Gemini格式
   */
  static transformRequest(claudeRequest: ClaudeRequest, context: AdapterContext): any {
    // 1. 映射模型名称
    const geminiModel = this.mapModelName(claudeRequest.model);
    
    // 2. 转换消息格式
    const contents = this.convertMessages(claudeRequest.messages, claudeRequest.system);
    
    // 3. 转换生成配置
    const generationConfig = this.convertGenerationConfig(claudeRequest);
    
    const geminiRequest: any = {
      contents,
      generationConfig,
    };
    
    // 添加安全设置
    geminiRequest.safetySettings = this.getDefaultSafetySettings();
    
    // 在上下文中存储原始模型名称用于响应
    context.context.set('originalModel', claudeRequest.model);
    context.context.set('geminiModel', geminiModel);
    
    return geminiRequest;
  }

  /**
   * 将Gemini响应转换为Claude格式
   */
  static transformResponse(geminiResponse: any, context: AdapterContext): ClaudeResponse {
    const originalModel = context.context.get('originalModel') || 'claude-3-sonnet-20240229';
    const requestId = context.requestId || this.generateId();

    // 验证Gemini响应结构
    if (!geminiResponse.candidates || geminiResponse.candidates.length === 0) {
      throw new Error('Invalid Gemini response: no candidates');
    }

    const candidate = geminiResponse.candidates[0];
    const content = candidate.content;

    if (!content || !content.parts || content.parts.length === 0) {
      throw new Error('Invalid Gemini response: no content parts');
    }

    // 提取文本内容
    const textContent = content.parts
      .filter((part: any) => part.text)
      .map((part: any) => part.text)
      .join('');

    // 确定停止原因
    const stopReason = this.mapStopReason(candidate.finishReason);

    // 构建Claude格式响应
    const claudeResponse: ClaudeResponse = {
      id: `msg_${requestId}`,
      type: 'message',
      role: 'assistant',
      content: [{
        type: 'text',
        text: textContent,
      }],
      model: originalModel,
      stop_reason: stopReason,
      usage: this.extractUsageInfo(geminiResponse),
    };

    return claudeResponse;
  }

  /**
   * 转换流式响应块
   */
  static transformStreamChunk(geminiChunk: any, _context: AdapterContext): string[] {
    const events: string[] = [];

    try {
      const data = typeof geminiChunk === 'string' ? JSON.parse(geminiChunk) : geminiChunk;
      
      if (!data.candidates || data.candidates.length === 0) {
        return events;
      }

      const candidate = data.candidates[0];

      // 处理内容增量
      if (candidate.content && candidate.content.parts) {
        const textParts = candidate.content.parts.filter((part: any) => part.text);
        
        for (const part of textParts) {
          if (part.text) {
            // Claude流式格式：content_block_delta事件
            const deltaEvent: ClaudeStreamEvent = {
              type: 'content_block_delta',
              delta: {
                type: 'text_delta',
                text: part.text,
              },
            };
            
            events.push(`event: content_block_delta\ndata: ${JSON.stringify(deltaEvent)}\n\n`);
          }
        }
      }

      // 检查是否完成
      if (candidate.finishReason) {
        const stopEvent: ClaudeStreamEvent = {
          type: 'message_stop',
        };
        
        // 如果有使用统计信息
        if (data.usageMetadata) {
          stopEvent.usage = {
            output_tokens: data.usageMetadata.candidatesTokenCount || 0,
          };
        }
        
        events.push(`event: message_stop\ndata: ${JSON.stringify(stopEvent)}\n\n`);
      }

      return events;
    } catch (error) {
      log.error('Error transforming Claude stream chunk:', error as Error);
      return [];
    }
  }

  // === 私有辅助方法 ===

  /**
   * 映射模型名称
   */
  private static mapModelName(claudeModel: string): string {
    const geminiModel = MODEL_MAPPINGS[claudeModel as keyof typeof MODEL_MAPPINGS];
    
    if (!geminiModel) {
      AdapterErrorHandler.handleModelMappingError(claudeModel, 'claude');
    }
    
    return geminiModel;
  }

  /**
   * 转换消息格式
   */
  private static convertMessages(messages: ClaudeMessage[], systemPrompt?: string): any[] {
    const contents: any[] = [];

    // 如果有系统提示，添加到第一个用户消息中
    let prependedSystem = false;

    for (const message of messages) {
      switch (message.role) {
        case 'user':
          let userContent = this.extractTextContent(message.content);
          
          // 将系统提示添加到第一个用户消息中
          if (systemPrompt && !prependedSystem) {
            userContent = `${systemPrompt}\n\n${userContent}`;
            prependedSystem = true;
          }

          contents.push({
            role: 'user',
            parts: [{ text: userContent }],
          });
          break;

        case 'assistant':
          contents.push({
            role: 'model',
            parts: [{ text: this.extractTextContent(message.content) }],
          });
          break;
      }
    }

    // 如果没有用户消息但有系统提示，创建一个用户消息
    if (systemPrompt && !prependedSystem) {
      contents.unshift({
        role: 'user',
        parts: [{ text: systemPrompt }],
      });
    }

    return contents;
  }

  /**
   * 从消息内容中提取文本
   */
  private static extractTextContent(content: string | any[]): string {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .filter(item => item.type === 'text' && item.text)
        .map(item => item.text)
        .join('');
    }

    return '';
  }

  /**
   * 转换生成配置
   */
  private static convertGenerationConfig(request: ClaudeRequest): any {
    const config: any = {};

    if (request.max_tokens !== undefined) {
      config.maxOutputTokens = request.max_tokens;
    }

    if (request.temperature !== undefined) {
      config.temperature = request.temperature;
    }

    if (request.top_p !== undefined) {
      config.topP = request.top_p;
    }

    if (request.top_k !== undefined) {
      config.topK = request.top_k;
    }

    if (request.stop_sequences !== undefined) {
      config.stopSequences = request.stop_sequences;
    }

    // 添加思考配置 - 默认启用思考功能
    const maxTokens = request.max_tokens || 8192;
    const thinkingBudget = Math.max(1024, Math.min(maxTokens - 1, 8192));
    
    config.thinkingConfig = {
      includeThoughts: true,
      thinkingBudget: thinkingBudget
    };

    return config;
  }

  /**
   * 获取默认安全设置
   */
  private static getDefaultSafetySettings(): any[] {
    return [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ];
  }

  /**
   * 映射停止原因
   */
  private static mapStopReason(geminiReason?: string): ClaudeResponse['stop_reason'] {
    switch (geminiReason) {
      case 'STOP':
        return 'end_turn';
      case 'MAX_TOKENS':
        return 'max_tokens';
      case 'SAFETY':
      case 'RECITATION':
        return 'end_turn';
      default:
        return 'end_turn';
    }
  }

  /**
   * 提取使用信息
   */
  private static extractUsageInfo(geminiResponse: any): { input_tokens: number; output_tokens: number } {
    if (geminiResponse.usageMetadata) {
      return {
        input_tokens: geminiResponse.usageMetadata.promptTokenCount || 0,
        output_tokens: geminiResponse.usageMetadata.candidatesTokenCount || 0,
      };
    }

    // 如果没有使用信息，返回默认值
    return {
      input_tokens: 0,
      output_tokens: 0,
    };
  }

  /**
   * 生成请求ID
   */
  private static generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}