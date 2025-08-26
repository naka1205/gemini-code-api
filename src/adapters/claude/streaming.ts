/**
 * Claude 流式响应转换器
 * 将 Gemini 流式响应转换为 Claude 格式的 SSE 事件流
 */

export interface StreamTransformerOptions {
  emitPrelude?: boolean;
  model?: string;
}

export function createClaudeStreamTransformer(
  model: string, 
  options: StreamTransformerOptions = {}
): TransformStream<Uint8Array, Uint8Array> {
  const { emitPrelude = false, model: modelName = model } = options;
  
  return new TransformStream({
    start(controller) {
      // 发送开始事件
      if (emitPrelude) {
        const startEvent = `event: message_start\ndata: ${JSON.stringify({
          type: 'message_start',
          message: {
            id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
            type: 'message',
            role: 'assistant',
            content: [],
            model: modelName,
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 }
          }
        })}\n\n`;
        controller.enqueue(new TextEncoder().encode(startEvent));
      }
    },
    
    transform(chunk, controller) {
      try {
        const text = new TextDecoder().decode(chunk);
        const lines = text.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            if (data.trim() === '[DONE]') {
              // 发送结束事件
              const stopEvent = `event: message_stop\ndata: ${JSON.stringify({
                type: 'message_stop'
              })}\n\n`;
              controller.enqueue(new TextEncoder().encode(stopEvent));
              continue;
            }
            
            try {
              const parsed = JSON.parse(data);
              
              // 处理 Gemini 流式响应
              if (parsed.candidates && parsed.candidates[0]) {
                const candidate = parsed.candidates[0];
                
                // 处理内容增量
                if (candidate.content && candidate.content.parts) {
                  for (const part of candidate.content.parts) {
                    if (part.text) {
                      // 发送内容增量事件
                      const deltaEvent = `event: content_block_delta\ndata: ${JSON.stringify({
                        type: 'content_block_delta',
                        index: 0,
                        delta: {
                          type: 'text_delta',
                          text: part.text
                        }
                      })}\n\n`;
                      controller.enqueue(new TextEncoder().encode(deltaEvent));
                    }
                  }
                }
                
                // 处理完成原因
                if (candidate.finishReason) {
                  const finishEvent = `event: message_delta\ndata: ${JSON.stringify({
                    type: 'message_delta',
                    delta: {
                      stop_reason: candidate.finishReason === 'STOP' ? 'end_turn' : 'max_tokens',
                      stop_sequence: null
                    },
                    usage: parsed.usageMetadata ? {
                      output_tokens: parsed.usageMetadata.totalTokenCount || 0
                    } : undefined
                  })}\n\n`;
                  controller.enqueue(new TextEncoder().encode(finishEvent));
                }
              }
            } catch (parseError) {
              // 如果解析失败，直接传递原始数据
              console.warn('Failed to parse Gemini streaming data:', parseError);
              controller.enqueue(chunk);
            }
          } else if (line.trim()) {
            // 传递非数据行（如 ping 事件）
            controller.enqueue(new TextEncoder().encode(line + '\n'));
          }
        }
      } catch (error) {
        console.error('Error in stream transformer:', error);
        // 出错时传递原始数据
        controller.enqueue(chunk);
      }
    },
    
    flush(controller) {
      // 发送完成事件
      const doneEvent = `event: message_stop\ndata: ${JSON.stringify({
        type: 'message_stop'
      })}\n\n`;
      controller.enqueue(new TextEncoder().encode(doneEvent));
    }
  });
}
