/**
 * Claude流式响应处理器
 * 专门处理Claude格式的流式响应转换和事件生成
 */
import type { AdapterContext } from '@/adapters/base/adapter.js';
import type { ClaudeStreamEvent, ClaudeResponse } from './transformer.js';
import { log } from '@/utils/logger.js';

/**
 * Claude流式响应管理器
 */
export class ClaudeStreamingManager {
  private messageId: string;
  private model: string;
  private contentBlockIndex: number = 0;
  private hasStarted: boolean = false;
  private hasContentBlock: boolean = false;

  constructor(messageId: string, model: string) {
    this.messageId = messageId;
    this.model = model;
  }

  /**
   * 生成message_start事件
   */
  generateMessageStart(): string {
    const event: ClaudeStreamEvent = {
      type: 'message_start',
      message: {
        id: this.messageId,
        type: 'message',
        role: 'assistant',
        content: [],
        model: this.model,
        stop_reason: null as any,
        stop_sequence: null as any,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    };

    this.hasStarted = true;
    return this.formatEvent('message_start', event);
  }

  /**
   * 生成content_block_start事件
   */
  generateContentBlockStart(): string {
    const event = {
      type: 'content_block_start',
      index: this.contentBlockIndex,
      content_block: {
        type: 'text',
        text: '',
      },
    };

    this.hasContentBlock = true;
    return this.formatEvent('content_block_start', event);
  }

  /**
   * 生成content_block_delta事件
   */
  generateContentBlockDelta(text: string): string {
    const event: ClaudeStreamEvent = {
      type: 'content_block_delta',
      delta: {
        type: 'text_delta',
        text,
      },
    };

    return this.formatEvent('content_block_delta', event);
  }

  /**
   * 生成content_block_stop事件
   */
  generateContentBlockStop(): string {
    const event = {
      type: 'content_block_stop',
      index: this.contentBlockIndex,
    };

    return this.formatEvent('content_block_stop', event);
  }

  /**
   * 生成message_delta事件（用于usage更新）
   */
  generateMessageDelta(usage?: { output_tokens: number }): string {
    const event: ClaudeStreamEvent = {
      type: 'message_delta',
      delta: {} as any,
    };

    if (usage) {
      event.usage = usage;
    }

    return this.formatEvent('message_delta', event);
  }

  /**
   * 生成message_stop事件
   */
  generateMessageStop(stopReason: ClaudeResponse['stop_reason'] = 'end_turn', stopSequence?: string): string {
    const event = {
      type: 'message_stop',
      stop_reason: stopReason,
      ...(stopSequence && { stop_sequence: stopSequence }),
    };

    return this.formatEvent('message_stop', event);
  }

  /**
   * 处理Gemini流式数据并转换为Claude事件序列
   */
  processGeminiStreamChunk(geminiData: any): string[] {
    const events: string[] = [];

    // 确保已发送message_start
    if (!this.hasStarted) {
      events.push(this.generateMessageStart());
    }

    try {
      if (!geminiData.candidates || geminiData.candidates.length === 0) {
        return events;
      }

      const candidate = geminiData.candidates[0];

      // 处理内容增量
      if (candidate.content && candidate.content.parts) {
        // 确保已发送content_block_start
        if (!this.hasContentBlock) {
          events.push(this.generateContentBlockStart());
        }

        const textParts = candidate.content.parts.filter((part: any) => part.text);
        
        for (const part of textParts) {
          if (part.text) {
            events.push(this.generateContentBlockDelta(part.text));
          }
        }
      }

      // 处理完成状态
      if (candidate.finishReason) {
        // 发送content_block_stop
        if (this.hasContentBlock) {
          events.push(this.generateContentBlockStop());
        }

        // 发送usage更新（如果有）
        if (geminiData.usageMetadata && geminiData.usageMetadata.candidatesTokenCount) {
          events.push(this.generateMessageDelta({
            output_tokens: geminiData.usageMetadata.candidatesTokenCount,
          }));
        }

        // 发送message_stop
        const stopReason = this.mapGeminiFinishReason(candidate.finishReason);
        events.push(this.generateMessageStop(stopReason));
      }

    } catch (error) {
      log.error('Error processing Gemini stream chunk:', error as Error);
    }

    return events;
  }

  /**
   * 格式化Server-Sent Events
   */
  private formatEvent(eventType: string, data: any): string {
    return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  /**
   * 映射Gemini完成原因到Claude格式
   */
  private mapGeminiFinishReason(geminiReason: string): ClaudeResponse['stop_reason'] {
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
}

/**
 * 创建Claude格式的流式转换器
 */
export function createClaudeStreamTransform(context: AdapterContext): TransformStream {
  const messageId = `msg_${Math.random().toString(36).substring(2)}`;
  const model = context.context.get('originalModel') || 'claude-3-sonnet-20240229';
  const streamManager = new ClaudeStreamingManager(messageId, model);

  return new TransformStream({
    start(controller) {
      // 立即发送message_start事件
      const messageStart = streamManager.generateMessageStart();
      controller.enqueue(new TextEncoder().encode(messageStart));
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
              // Gemini流结束，确保发送message_stop
              const messageStop = streamManager.generateMessageStop();
              controller.enqueue(new TextEncoder().encode(messageStop));
              return;
            }

            try {
              const geminiData = JSON.parse(jsonStr);
              
              // 处理Gemini数据并转换为Claude事件
              const claudeEvents = streamManager.processGeminiStreamChunk(geminiData);
              
              claudeEvents.forEach(event => {
                controller.enqueue(new TextEncoder().encode(event));
              });
              
            } catch (parseError) {
              log.warn('Failed to parse Gemini streaming data:', { error: parseError });
            }
          }
        }
      } catch (error) {
        log.error('Claude stream transform error:', error as Error);
        
        // 发送错误并终止流
        const errorEvent = {
          type: 'error',
          error: {
            type: 'api_error',
            message: 'Stream processing error',
          },
        };
        
        controller.enqueue(new TextEncoder().encode(
          `event: error\ndata: ${JSON.stringify(errorEvent)}\n\n`
        ));
        controller.error(error);
      }
    },

    flush(controller) {
      // 确保流正确结束
      try {
        const messageStop = streamManager.generateMessageStop();
        controller.enqueue(new TextEncoder().encode(messageStop));
      } catch (error) {
        log.error('Error in stream flush:', error as Error);
      }
    }
  });
}

/**
 * Claude流式响应验证器
 */
export class ClaudeStreamValidator {
  /**
   * 验证Claude流式事件格式
   */
  static validateStreamEvent(event: any): boolean {
    if (!event || typeof event !== 'object') {
      return false;
    }

    const validTypes = [
      'message_start',
      'content_block_start', 
      'content_block_delta',
      'content_block_stop',
      'message_delta',
      'message_stop',
      'error'
    ];

    return validTypes.includes(event.type);
  }

  /**
   * 验证事件序列的完整性
   */
  static validateEventSequence(events: string[]): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    let hasMessageStart = false;
    let hasContentBlockStart = false;
    let hasMessageStop = false;

    for (const eventStr of events) {
      try {
        const lines = eventStr.split('\n');
        const eventTypeLine = lines.find(line => line.startsWith('event: '));
        const dataLine = lines.find(line => line.startsWith('data: '));
        
        if (!eventTypeLine || !dataLine) continue;

        const eventType = eventTypeLine.substring(7);
        
        switch (eventType) {
          case 'message_start':
            hasMessageStart = true;
            break;
          case 'content_block_start':
            if (!hasMessageStart) {
              errors.push('content_block_start before message_start');
            }
            hasContentBlockStart = true;
            break;
          case 'content_block_delta':
            if (!hasContentBlockStart) {
              errors.push('content_block_delta before content_block_start');
            }
            break;
          case 'message_stop':
            hasMessageStop = true;
            break;
        }
      } catch (error) {
        errors.push(`Invalid event format: ${error}`);
      }
    }

    if (!hasMessageStart) {
      errors.push('Missing message_start event');
    }

    if (!hasMessageStop) {
      errors.push('Missing message_stop event');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}