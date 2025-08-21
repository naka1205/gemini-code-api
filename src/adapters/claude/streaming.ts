// Claude流式适配器
// 实现Claude API的流式响应

import { ClaudeCore, ClaudeHttpError } from './core';
import type { ClaudeRequest, ClaudeStreamEvent, GeminiClaudeRequest, GeminiClaudeResponse } from '../../types/claude';

export class ClaudeStreamingAdapter extends ClaudeCore {
  constructor(config: { apiKey: string }) {
    super(config);
  }

  // 创建流式响应
  async createStream(request: ClaudeRequest): Promise<Response> {
    try {
      // 转换Claude请求到Gemini请求
      const geminiRequest = this.convertClaudeToGemini(request);
      
      // 创建流式响应
      const stream = this.createClaudeStream(geminiRequest, request.model);
      
      // 添加响应头
      const headers = new Headers({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
        'anthropic-version': '2023-06-01',
        'x-real-model': this.mapClaudeToGeminiModel(request.model),
        'x-requested-model': request.model
      });

      return new Response(stream as any, {
        status: 200,
        headers
      });

    } catch (error) {
      return this.handleError(error);
    }
  }

  // 转换Claude请求到Gemini请求（与消息适配器相同）
  private convertClaudeToGemini(claudeRequest: ClaudeRequest): GeminiClaudeRequest {
    const {
      model,
      messages,
      system,
      max_tokens,
      temperature = 1.0,
      top_p,
      top_k,
      stop_sequences,
      tools,
      tool_choice,
    } = claudeRequest;

    const geminiModel = this.mapClaudeToGeminiModel(model);
    const contents: any[] = [];
    let systemInstruction: any = undefined;

    // 处理系统指令
    if (system) {
      if (typeof system === 'string') {
        systemInstruction = { parts: [{ text: system }] };
      } else if (Array.isArray(system)) {
        const txt = system
          .filter((b: any) => b?.type === 'text')
          .map((b: any) => b?.text || '')
          .join('\n');
        if (txt) systemInstruction = { parts: [{ text: txt }] };
      }
    }

    // 处理消息
    for (const msg of messages || []) {
      if (msg?.role === 'system') {
        const txt = typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content.filter((b: any) => b?.type === 'text').map((b: any) => b.text || '').join('\n')
            : '';
        if (txt && !systemInstruction) systemInstruction = { parts: [{ text: txt }] };
        continue;
      }

      const role = msg?.role === 'user' ? 'user' : 'model';
      const parts: any[] = [];

      if (typeof msg?.content === 'string') {
        parts.push({ text: msg.content });
      } else if (Array.isArray(msg?.content)) {
        for (const block of msg.content) {
          switch (block?.type) {
            case 'text':
              parts.push({ text: block.text || '' });
              break;
            case 'image': {
              const src = block.source as any;
              if (src?.data) {
                parts.push({ 
                  inlineData: { 
                    mimeType: src.media_type || 'image/jpeg', 
                    data: src.data 
                  } 
                });
              }
              break;
            }
            case 'tool_use':
              parts.push({ 
                functionCall: { 
                  name: block.name, 
                  args: block.input || {} 
                } 
              });
              break;
            case 'tool_result': {
              const content = block.content;
              let resultText = '';
              if (typeof content === 'string') resultText = content;
              else if (Array.isArray(content)) {
                resultText = content
                  .filter((c: any) => c?.type === 'text')
                  .map((c: any) => c.text || '')
                  .join('\n');
              } else resultText = JSON.stringify(content ?? {});
              parts.push({ 
                functionResponse: { 
                  name: block.tool_use_id, 
                  response: { result: resultText } 
                } 
              });
              break;
            }
          }
        }
      }

      if (parts.length > 0) contents.push({ role, parts });
    }

    // 生成配置
    const generationConfig: any = { 
      maxOutputTokens: max_tokens, 
      temperature 
    };
    if (typeof top_p === 'number') generationConfig.topP = top_p;
    if (typeof top_k === 'number') generationConfig.topK = top_k;
    if (Array.isArray(stop_sequences) && stop_sequences.length > 0) {
      generationConfig.stopSequences = stop_sequences;
    }

    const body: any = { contents, generationConfig };
    if (systemInstruction) body.systemInstruction = systemInstruction;

    // 处理工具
    if (Array.isArray(tools) && tools.length > 0) {
      const functionDeclarations = tools.map((t: any) => {
        const cleaned = this.pruneToolSchema(t?.input_schema || {});
        const parameters = Object.keys(cleaned).length ? cleaned : { type: 'object', properties: {} };
        return { 
          name: t?.name, 
          description: t?.description || '', 
          parameters 
        };
      });
      body.tools = [{ functionDeclarations }];
      body.toolConfig = this.getToolConfig(tool_choice);
    }

    return { contents, systemInstruction, generationConfig, tools: body.tools, toolConfig: body.toolConfig };
  }

  // 创建Claude流式响应
  private createClaudeStream(geminiRequest: GeminiClaudeRequest, model: string): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const messageId = `msg_${this.generateUUID()}`;
    const geminiModel = this.mapClaudeToGeminiModel(model);
    const baseUrl = this.BASE_URL;
    const apiVersion = this.API_VERSION;
    const apiKey = this.config.apiKey;
    const safetySettings = this.getSafetySettings();
    
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        // 发送流式开始事件
        const startEvent: ClaudeStreamEvent = {
          type: 'message_start',
                      message: {
              id: messageId,
              type: 'message',
              role: 'assistant',
              content: [],
              model,
              stop_reason: 'end_turn',
              stop_sequence: null,
              usage: { input_tokens: 0, output_tokens: 0 }
            }
        };

        controller.enqueue(encoder.encode(`event: message_start\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(startEvent)}\n\n`));

        // 发送ping事件
        const pingEvent: ClaudeStreamEvent = { type: 'ping' };
        controller.enqueue(encoder.encode(`event: ping\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(pingEvent)}\n\n`));
      },

      async pull(controller) {
        try {
          // 调用Gemini流式API
          const endpoint = `models/${encodeURIComponent(geminiModel)}:streamGenerateContent?alt=sse`;
          
          const response = await fetch(`${baseUrl}/${apiVersion}/${endpoint}`, {
            method: 'POST',
            headers: {
              'Accept': 'text/event-stream',
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey
            },
            body: JSON.stringify({
              contents: geminiRequest.contents,
              systemInstruction: geminiRequest.systemInstruction,
              generationConfig: geminiRequest.generationConfig,
              tools: geminiRequest.tools,
              toolConfig: geminiRequest.toolConfig,
              safetySettings
            })
          });

          if (!response.ok) {
            throw new ClaudeHttpError('Gemini streaming API request failed', response.status);
          }

          if (!response.body) {
            throw new ClaudeHttpError('No response body from Gemini API', 500);
          }

          // 处理Gemini流式响应
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let contentBlockIndex = 0;
          let totalOutput = 0;
          let contentBlockOpen = false;

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split('\n');

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6).trim();
                  if (data === '[DONE]') continue;

                  try {
                    const obj = JSON.parse(data);
                    
                    // 更新token计数
                    if (obj?.usageMetadata?.candidatesTokenCount) {
                      totalOutput = obj.usageMetadata.candidatesTokenCount;
                    }

                    const cand = Array.isArray(obj?.candidates) ? obj.candidates[0] : undefined;
                    const parts = cand?.content?.parts || [];

                    // 处理内容部分
                    for (const part of parts) {
                      if (part?.text) {
                        if (!contentBlockOpen) {
                          const startBlockEvent: ClaudeStreamEvent = {
                            type: 'content_block_start',
                            index: contentBlockIndex,
                            content_block: { type: 'text', text: '' }
                          };
                          controller.enqueue(encoder.encode(`event: content_block_start\n`));
                          controller.enqueue(encoder.encode(`data: ${JSON.stringify(startBlockEvent)}\n\n`));
                          contentBlockOpen = true;
                        }

                        const deltaEvent: ClaudeStreamEvent = {
                          type: 'content_block_delta',
                          index: contentBlockIndex,
                          delta: { type: 'text_delta', text: part.text }
                        };
                        controller.enqueue(encoder.encode(`event: content_block_delta\n`));
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(deltaEvent)}\n\n`));
                      }

                      if (part?.functionCall) {
                        if (contentBlockOpen) {
                          const stopBlockEvent: ClaudeStreamEvent = {
                            type: 'content_block_stop',
                            index: contentBlockIndex
                          };
                          controller.enqueue(encoder.encode(`event: content_block_stop\n`));
                          controller.enqueue(encoder.encode(`data: ${JSON.stringify(stopBlockEvent)}\n\n`));
                          contentBlockOpen = false;
                          contentBlockIndex++;
                        }

                        const toolUseId = `toolu_${Math.random().toString(36).substring(2, 15)}`;
                        const toolStartEvent: ClaudeStreamEvent = {
                          type: 'content_block_start',
                          index: contentBlockIndex,
                          content_block: { 
                            type: 'tool_use', 
                            id: toolUseId, 
                            name: part.functionCall.name, 
                            input: {} 
                          }
                        };
                        controller.enqueue(encoder.encode(`event: content_block_start\n`));
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(toolStartEvent)}\n\n`));

                        if (part.functionCall.args) {
                          const toolDeltaEvent: ClaudeStreamEvent = {
                            type: 'content_block_delta',
                            index: contentBlockIndex,
                            delta: { 
                              type: 'input_json_delta', 
                              partial_json: JSON.stringify(part.functionCall.args) 
                            }
                          };
                          controller.enqueue(encoder.encode(`event: content_block_delta\n`));
                          controller.enqueue(encoder.encode(`data: ${JSON.stringify(toolDeltaEvent)}\n\n`));
                        }

                        const toolStopEvent: ClaudeStreamEvent = {
                          type: 'content_block_stop',
                          index: contentBlockIndex
                        };
                        controller.enqueue(encoder.encode(`event: content_block_stop\n`));
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(toolStopEvent)}\n\n`));
                        contentBlockIndex++;
                      }
                    }

                    // 检查是否完成
                    const fr = cand?.finishReason;
                    if (fr === 'STOP' || fr === 'MAX_TOKENS') {
                      if (contentBlockOpen) {
                        const stopBlockEvent: ClaudeStreamEvent = {
                          type: 'content_block_stop',
                          index: contentBlockIndex
                        };
                        controller.enqueue(encoder.encode(`event: content_block_stop\n`));
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(stopBlockEvent)}\n\n`));
                        contentBlockOpen = false;
                      }

                      const stopReason = fr === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn';
                      const msgDeltaEvent: ClaudeStreamEvent = {
                        type: 'message_delta',
                        delta: { 
                          type: 'text_delta',
                          stop_reason: stopReason, 
                          stop_sequence: null 
                        },
                        usage: { output_tokens: totalOutput }
                      };
                      controller.enqueue(encoder.encode(`event: message_delta\n`));
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify(msgDeltaEvent)}\n\n`));

                      const msgStopEvent: ClaudeStreamEvent = { type: 'message_stop' };
                      controller.enqueue(encoder.encode(`event: message_stop\n`));
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify(msgStopEvent)}\n\n`));
                    }
                  } catch (e) {
                    // 忽略JSON解析错误
                  }
                }
              }
            }
          } finally {
            reader.releaseLock();
          }

          // 发送流式结束事件
          if (contentBlockOpen) {
            const stopBlockEvent: ClaudeStreamEvent = {
              type: 'content_block_stop',
              index: contentBlockIndex
            };
            controller.enqueue(encoder.encode(`event: content_block_stop\n`));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(stopBlockEvent)}\n\n`));
          }

          const messageDeltaEvent: ClaudeStreamEvent = {
            type: 'message_delta',
            delta: {
              type: 'text_delta',
              stop_reason: 'end_turn',
              stop_sequence: null
            },
            usage: { output_tokens: totalOutput }
          };
          controller.enqueue(encoder.encode(`event: message_delta\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(messageDeltaEvent)}\n\n`));

          const messageStopEvent: ClaudeStreamEvent = { type: 'message_stop' };
          controller.enqueue(encoder.encode(`event: message_stop\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(messageStopEvent)}\n\n`));

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();

        } catch (error) {
          console.error('Streaming error:', error);
          controller.error(error);
        }
      }
    });
  }
}
