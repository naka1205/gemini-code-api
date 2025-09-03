// src/logic/processors/streaming.ts

/**
 * 流式输出处理器 - 专门处理Claude和Gemini之间的流式数据转换
 * 遵循"只做数据结构转换，不处理对话内容"的原则
 */

import { ToolsProcessor } from './tools';

export interface StreamingEvent {
  type: string;
  data: any;
}

export interface ContentBlock {
  type: 'thinking' | 'text' | 'tool_use';
  thinking?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: any;
}

export class StreamingProcessor {
  /**
   * 创建Claude流式转换器
   * 按照BAK原版逻辑实现
   */
  static createClaudeStreamTransformer(geminiStream: ReadableStream, originalRequest: any): ReadableStream {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    let contentBlockIndex = 0;
    let lineBuffer = '';

    const transformStream = new TransformStream<Uint8Array, Uint8Array>({
      start(controller) {
        // 按照BAK原版逻辑发送message_start事件
        const startEvent = {
          type: 'message_start',
          message: {
            id: messageId,
            type: 'message',
            role: 'assistant',
            content: [],
            model: originalRequest.model,
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 }
          }
        };
        
        controller.enqueue(encoder.encode(`event: message_start\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(startEvent)}\n\n`));
        
        // 按照BAK原版逻辑发送ping事件
        controller.enqueue(encoder.encode(`event: ping\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'ping' })}\n\n`));
      },

      transform(chunk: Uint8Array, controller: TransformStreamDefaultController<Uint8Array>) {
        // 按照BAK原版逻辑处理跨块的行缓冲
        lineBuffer += decoder.decode(chunk, { stream: true });
        let nlIndex;
        
        while ((nlIndex = lineBuffer.indexOf('\n')) !== -1) {
          const line = lineBuffer.slice(0, nlIndex);
          lineBuffer = lineBuffer.slice(nlIndex + 1);
          const trimmed = line.trim();
          
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          
          const data = trimmed.slice(6).trim();
          if (!data || data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            const parts = parsed.candidates?.[0]?.content?.parts || [];
            
            for (const part of parts) {
              if (part?.thought === true && typeof part?.text === 'string') {
                StreamingProcessor.processThinkingBlock(controller, contentBlockIndex, part.text);
                contentBlockIndex++;
              }
              if (part?.text && part?.thought !== true) {
                StreamingProcessor.processTextBlock(controller, contentBlockIndex, part.text);
                contentBlockIndex++;
              }
              if (part?.functionCall) {
                StreamingProcessor.processToolUseBlock(controller, contentBlockIndex, part.functionCall);
                contentBlockIndex++;
              }
            }
          } catch (e) {
            console.warn('Failed to parse SSE data:', e);
          }
        }
      },

      flush(controller: TransformStreamDefaultController<Uint8Array>) {
        // 处理剩余的缓冲区内容
        if (lineBuffer.trim()) {
          try {
            const data = lineBuffer.trim().replace(/^data: /, '');
            if (data && data !== '[DONE]') {
              const parsed = JSON.parse(data);
              const parts = parsed.candidates?.[0]?.content?.parts || [];
              
              for (const part of parts) {
                if (part?.thought === true && typeof part?.text === 'string') {
                  StreamingProcessor.processThinkingBlock(controller, contentBlockIndex, part.text);
                  contentBlockIndex++;
                }
                if (part?.text && part?.thought !== true) {
                  StreamingProcessor.processTextBlock(controller, contentBlockIndex, part.text);
                  contentBlockIndex++;
                }
                if (part?.functionCall) {
                  StreamingProcessor.processToolUseBlock(controller, contentBlockIndex, part.functionCall);
                  contentBlockIndex++;
                }
              }
            }
          } catch (e) {
            console.warn('Failed to parse remaining buffer:', e);
          }
        }

        // 按照BAK原版逻辑发送结束事件
        if (contentBlockIndex > 0) {
          // 发送content_block_stop事件
          controller.enqueue(encoder.encode(`event: content_block_stop\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex - 1 })}\n\n`));
        }

        // 发送message_delta事件
        const deltaEvent = {
          type: 'message_delta',
          delta: {
            stop_reason: 'end_turn',
            stop_sequence: null
          },
          usage: {
            output_tokens: contentBlockIndex
          }
        };
        controller.enqueue(encoder.encode(`event: message_delta\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(deltaEvent)}\n\n`));

        // 发送message_stop事件
        const stopEvent = { type: 'message_stop' };
        controller.enqueue(encoder.encode(`event: message_stop\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(stopEvent)}\n\n`));
      }
    });

    return geminiStream.pipeThrough(transformStream);
  }

  /**
   * 处理思考内容块
   */
  static processThinkingBlock(controller: TransformStreamDefaultController<Uint8Array>, index: number, text: string): void {
    const encoder = new TextEncoder();
    
    // 发送content_block_start事件
    const startEvent = {
      type: 'content_block_start',
      index: index,
      content_block: {
        type: 'thinking',
        thinking: text
      }
    };
    controller.enqueue(encoder.encode(`event: content_block_start\n`));
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(startEvent)}\n\n`));

    // 发送content_block_delta事件
    const deltaEvent = {
      type: 'content_block_delta',
      index: index,
      delta: {
        type: 'thinking_delta',
        thinking: text
      }
    };
    controller.enqueue(encoder.encode(`event: content_block_delta\n`));
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(deltaEvent)}\n\n`));

    // 发送content_block_stop事件
    const stopEvent = {
      type: 'content_block_stop',
      index: index
    };
    controller.enqueue(encoder.encode(`event: content_block_stop\n`));
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(stopEvent)}\n\n`));
  }

  /**
   * 处理文本内容块
   */
  static processTextBlock(controller: TransformStreamDefaultController<Uint8Array>, index: number, text: string): void {
    const encoder = new TextEncoder();
    
    // 发送content_block_start事件
    const startEvent = {
      type: 'content_block_start',
      index: index,
      content_block: {
        type: 'text',
        text: ''
      }
    };
    controller.enqueue(encoder.encode(`event: content_block_start\n`));
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(startEvent)}\n\n`));

    // 发送content_block_delta事件
    const deltaEvent = {
      type: 'content_block_delta',
      index: index,
      delta: {
        type: 'text_delta',
        text: text
      }
    };
    controller.enqueue(encoder.encode(`event: content_block_delta\n`));
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(deltaEvent)}\n\n`));
  }

  /**
   * 处理工具使用块
   */
  static processToolUseBlock(controller: TransformStreamDefaultController<Uint8Array>, index: number, functionCall: any): void {
    const encoder = new TextEncoder();
    const toolUseId = ToolsProcessor.generateToolUseId();
    
    // 发送content_block_start事件
    const startEvent = {
      type: 'content_block_start',
      index: index,
      content_block: {
        type: 'tool_use',
        id: toolUseId,
        name: functionCall.name,
        input: functionCall.args || {}
      }
    };
    controller.enqueue(encoder.encode(`event: content_block_start\n`));
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(startEvent)}\n\n`));

    // 发送content_block_stop事件
    const stopEvent = {
      type: 'content_block_stop',
      index: index
    };
    controller.enqueue(encoder.encode(`event: content_block_stop\n`));
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(stopEvent)}\n\n`));
  }

  /**
   * 创建SSE事件数据
   * 只做格式转换，不生成内容
   */
  static createSSEEvent(eventType: string, data: any): string {
    return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  /**
   * 创建Claude标准的消息开始事件
   * 只做结构转换，不生成内容
   */
  static createMessageStartEvent(messageId: string, model: string): any {
    return { 
      type: 'message_start', 
      message: { 
        id: messageId, 
        type: 'message', 
        role: 'assistant', 
        content: [], 
        model: model, 
        stop_reason: null, 
        stop_sequence: null, 
        usage: { input_tokens: 0, output_tokens: 0 } 
      } 
    };
  }

  /**
   * 创建Claude标准的消息增量事件
   * 只做结构转换，不生成内容
   */
  static createMessageDeltaEvent(stopReason: string = 'end_turn'): any {
    return { 
      type: 'message_delta', 
      delta: { stop_reason: stopReason, stop_sequence: null }, 
      usage: { output_tokens: 0 } 
    };
  }

  /**
   * 创建Claude标准的消息停止事件
   * 只做结构转换，不生成内容
   */
  static createMessageStopEvent(): any {
    return { type: 'message_stop' };
  }

  /**
   * 创建Claude标准的ping事件
   * 只做结构转换，不生成内容
   */
  static createPingEvent(): any {
    return { type: 'ping' };
  }

  /**
   * 创建内容块开始事件
   * 只做结构转换，不生成内容
   */
  static createContentBlockStartEvent(index: number, blockType: string, blockData: any = {}): any {
    return {
      type: 'content_block_start',
      index: index,
      content_block: { type: blockType, ...blockData }
    };
  }

  /**
   * 创建内容块增量事件
   * 只做结构转换，不生成内容
   */
  static createContentBlockDeltaEvent(index: number, deltaType: string, deltaData: any): any {
    return {
      type: 'content_block_delta',
      index: index,
      delta: { type: deltaType, ...deltaData }
    };
  }

  /**
   * 创建内容块停止事件
   * 只做结构转换，不生成内容
   */
  static createContentBlockStopEvent(index: number): any {
    return {
      type: 'content_block_stop',
      index: index
    };
  }
}
