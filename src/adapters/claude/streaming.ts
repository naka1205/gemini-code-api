// Claude流式处理适配器模块
// 处理流式消息请求和token提取逻辑

import { ClaudeCore } from './core';
import type { 
  ClaudeRequest
} from '../../types/claude';

export class ClaudeStreamingAdapter extends ClaudeCore {

  // 处理流式消息创建请求
  async createStream(claudeRequest: ClaudeRequest): Promise<Response> {
    try {
      const requestId = this.getRequestId();
      
      // 转换请求格式
      const geminiData = this.claudeToGemini(claudeRequest);
      
      // 创建弹性流式响应
      const stream = this.resilientClaudeStream(
        async () => {
          const endpoint = `models/${geminiData.model}:streamGenerateContent?alt=sse`;
          return fetch(`${this.BASE_URL}/${this.API_VERSION}/${endpoint}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'text/event-stream',
              'x-goog-api-key': this.config.apiKey,
            },
            body: this.json(geminiData.body),
          });
        },
        claudeRequest.model || 'claude',
        3000,
        2
      );

      return new Response(stream as any, { 
        status: 200, 
        headers: { 
          ...this.sseHeaders(), 
          'x-request-id': requestId 
        } 
      });
    } catch (e: any) {
      return this.handleError(e);
    }
  }

  // 转换Claude请求到Gemini格式（复用messages.ts的逻辑）
  private claudeToGemini(claudeRequest: ClaudeRequest): { model: string; body: any; stream: boolean } {
    const {
      model,
      messages,
      stream = true,
      max_tokens = 1024,
      temperature = 1.0,
      top_p,
      top_k,
      stop_sequences,
      system,
      tools,
      tool_choice,
      thinking,
    } = claudeRequest || {};

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
              const src = block.source;
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
              else if (Array.isArray(content)) resultText = content.filter((c: any) => c?.type === 'text').map((c: any) => c.text || '').join('\n');
              else resultText = this.json(content ?? {});
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

    const generationConfig: any = { 
      maxOutputTokens: max_tokens, 
      temperature 
    };
    if (typeof top_p === 'number') generationConfig.topP = top_p;
    if (typeof top_k === 'number') generationConfig.topK = top_k;
    if (Array.isArray(stop_sequences) && stop_sequences.length > 0) generationConfig.stopSequences = stop_sequences;

    const body: any = { 
      contents, 
      generationConfig 
    };
    if (systemInstruction) body.systemInstruction = systemInstruction;

    const enableThinking = !thinking || thinking?.type !== 'disabled';
    if (enableThinking) {
      const budget = typeof thinking?.budget_tokens === 'number' ? thinking.budget_tokens : 8192;
      generationConfig.thinkingConfig = {
        includeThoughts: true,
        thinkingBudget: Math.max(1024, Math.min(max_tokens - 1, budget))
      };
    }

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

      const choice = tool_choice || { type: 'auto' };
      if (choice?.type === 'tool' && choice?.name) {
        body.toolConfig = { 
          functionCallingConfig: { 
            mode: 'ANY', 
            allowedFunctionNames: [choice.name] 
          } 
        };
      } else if (choice?.type === 'any') {
        body.toolConfig = { 
          functionCallingConfig: { 
            mode: 'ANY' 
          } 
        };
      } else if (choice?.type === 'none') {
        body.toolConfig = { 
          functionCallingConfig: { 
            mode: 'NONE' 
          } 
        };
      } else {
        body.toolConfig = { 
          functionCallingConfig: { 
            mode: 'AUTO' 
          } 
        };
      }
    }

    return { model: geminiModel, body, stream };
  }

  // 创建Claude流式转换器
  private createClaudeStreamTransformer(
    model: string,
    options?: { emitPrelude?: boolean }
  ): TransformStream<Uint8Array, Uint8Array> {
    const enc = new TextEncoder();
    const dec = new TextDecoder();
    const MESSAGE_ID = `msg_${this.generateUUID()}`;
    const self = this; // 保存this引用
    let started = false;
    let contentBlockOpen = false;
    let contentBlockIndex = 0;
    let currentBlockType: 'thinking' | 'text' | 'tool_use' | null = null;
    // 记录已输出的思考文本长度，避免重复增量
    let lastThinkingText: string = '';
    // 跨事件缓存：按part索引跟踪已输出的思考与脱敏思考，避免重复
    const partThinkingBuffers: Record<number, string> = {};
    const partRedactedBuffers: Record<number, string> = {};
    let lastSignature: string = '';
    // 控制思考/文本阶段
    // - thinkingStarted：已开始输出思考块
    // - textStarted：一旦开始输出文本，则不再输出思考增量
    let thinkingStarted = false;
    let textStarted = false;
    let totalInput = 0;
    let totalOutput = 0;
    let firstTokenAt = 0;
    let messageStartAt = 0;
    let lineBuffer = '';
    let tailEmitted = false;
    // 缓存文本，在同一事件包含思考增量时延迟输出
    const pendingTextChunks: string[] = [];

    return new TransformStream<Uint8Array, Uint8Array>({
      start(controller) {
        const emitPrelude = options?.emitPrelude !== false;
        if (emitPrelude) {
          const startEvt = { 
            type: 'message_start', 
            message: { 
              id: MESSAGE_ID, 
              type: 'message', 
              role: 'assistant', 
              content: [], 
              model, 
              stop_reason: null, 
              stop_sequence: null, 
              usage: { input_tokens: 0, output_tokens: 0 } 
            } 
          };
          controller.enqueue(enc.encode(`event: message_start\n`));
          controller.enqueue(enc.encode(`data: ${JSON.stringify(startEvt)}\n\n`));
          controller.enqueue(enc.encode(`event: ping\n`));
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'ping' })}\n\n`));
          messageStartAt = Date.now();
        }
        started = true;
      },
      
      transform(chunk, controller) {
        // 缓冲跨块的行以避免在边界处截断JSON
        lineBuffer += dec.decode(chunk, { stream: true });
        let nlIndex;
        while ((nlIndex = lineBuffer.indexOf('\n')) !== -1) {
          const line = lineBuffer.slice(0, nlIndex);
          lineBuffer = lineBuffer.slice(nlIndex + 1);
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6).trim();
          if (!data) continue;
          if (data === '[DONE]') {
            // 在flush中处理最终化以避免重复
            continue;
          }
          try {
            const obj = JSON.parse(data);
            if (obj?.usageMetadata?.candidatesTokenCount != null) totalOutput = obj.usageMetadata.candidatesTokenCount;
            if (obj?.usageMetadata?.promptTokenCount != null) totalInput = obj.usageMetadata.promptTokenCount;
            const cand = Array.isArray(obj?.candidates) ? obj.candidates[0] : undefined;
            const parts = cand?.content?.parts || [];
            
            // 先处理候选级思考，计算首token时间基准
            const candThought: string | undefined = (cand as any)?.thought || (cand as any)?.thinking || (cand as any)?.internalThought;
            const hasAnyPlainText = parts?.some((p:any)=>p?.text && p?.thought !== true);
            if (!firstTokenAt && (hasAnyPlainText || (typeof candThought === 'string' && candThought.length > 0))) {
              firstTokenAt = Date.now();
            }
            
            // 有候选级思考时，优先输出候选级，避免重复输出part级思考
            const hasCandThought = typeof candThought === 'string' && candThought.length > 0;
            // 仅当实际输出了思考delta时，才推迟同事件文本输出
            let hasThinkingDeltaInEvent = false;
            
            if (!textStarted && hasCandThought) {
              const newSegment = candThought.slice(lastThinkingText.length);
              if (newSegment.length > 0) {
                if (!thinkingStarted) {
                  if (contentBlockOpen) {
                    controller.enqueue(enc.encode(`event: content_block_stop\n`));
                    controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex })}\n\n`));
                    contentBlockIndex++;
                  }
                  const startBlock = { type: 'content_block_start', index: contentBlockIndex, content_block: { type: 'thinking', thinking: '' } };
                  controller.enqueue(enc.encode(`event: content_block_start\n`));
                  controller.enqueue(enc.encode(`data: ${JSON.stringify(startBlock)}\n\n`));
                  contentBlockOpen = true;
                  currentBlockType = 'thinking';
                  thinkingStarted = true;
                }
                const deltaEvt = { type: 'content_block_delta', index: contentBlockIndex, delta: { type: 'thinking_delta', thinking: newSegment } };
                controller.enqueue(enc.encode(`event: content_block_delta\n`));
                controller.enqueue(enc.encode(`data: ${JSON.stringify(deltaEvt)}\n\n`));
                lastThinkingText = candThought;
                hasThinkingDeltaInEvent = true;
              }
            }

            for (let i = 0; i < parts.length; i++) {
              const part = parts[i];
              // Handle thinking/redacted_thinking（兼容 thought === true 表示该part的text为思考内容）
              let thinkingText: string | undefined;
              if (part?.thought === true && typeof part?.text === 'string') {
                thinkingText = part.text;
              } else if (typeof part?.thinking === 'string') {
                thinkingText = part.thinking;
              } else if (typeof part?.internalThought === 'string') {
                thinkingText = part.internalThought;
              }
              const redactedThinking: string | undefined = part?.redacted_thinking || part?.redactedThinking;
              const signature: string | undefined = part?.signature;

              if (!textStarted && !hasCandThought && typeof thinkingText === 'string' && thinkingText.length > 0) {
                const prev = partThinkingBuffers[i] || '';
                const newSeg = thinkingText.slice(prev.length);
                if (newSeg.length > 0) {
                  if (!thinkingStarted) {
                    if (contentBlockOpen) {
                      controller.enqueue(enc.encode(`event: content_block_stop\n`));
                      controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex })}\n\n`));
                      contentBlockIndex++;
                    }
                    const startBlock = { type: 'content_block_start', index: contentBlockIndex, content_block: { type: 'thinking', thinking: '' } };
                    controller.enqueue(enc.encode(`event: content_block_start\n`));
                    controller.enqueue(enc.encode(`data: ${JSON.stringify(startBlock)}\n\n`));
                    contentBlockOpen = true;
                    currentBlockType = 'thinking';
                    thinkingStarted = true;
                  }
                  const deltaEvt = { type: 'content_block_delta', index: contentBlockIndex, delta: { type: 'thinking_delta', thinking: newSeg } };
                  controller.enqueue(enc.encode(`event: content_block_delta\n`));
                  controller.enqueue(enc.encode(`data: ${JSON.stringify(deltaEvt)}\n\n`));
                  partThinkingBuffers[i] = thinkingText;
                  hasThinkingDeltaInEvent = true;
                }
              }

              if (!textStarted && !hasCandThought && typeof redactedThinking === 'string' && redactedThinking.length > 0) {
                const prevR = partRedactedBuffers[i] || '';
                const newSegR = redactedThinking.slice(prevR.length);
                if (newSegR.length > 0) {
                  if (!thinkingStarted) {
                    if (contentBlockOpen) {
                      controller.enqueue(enc.encode(`event: content_block_stop\n`));
                      controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex })}\n\n`));
                      contentBlockIndex++;
                    }
                    const startBlock = { type: 'content_block_start', index: contentBlockIndex, content_block: { type: 'redacted_thinking', thinking: '' } };
                    controller.enqueue(enc.encode(`event: content_block_start\n`));
                    controller.enqueue(enc.encode(`data: ${JSON.stringify(startBlock)}\n\n`));
                    contentBlockOpen = true;
                    currentBlockType = 'thinking';
                    thinkingStarted = true;
                  }
                  const deltaEvt = { type: 'content_block_delta', index: contentBlockIndex, delta: { type: 'thinking_delta', thinking: newSegR } };
                  controller.enqueue(enc.encode(`event: content_block_delta\n`));
                  controller.enqueue(enc.encode(`data: ${JSON.stringify(deltaEvt)}\n\n`));
                  partRedactedBuffers[i] = redactedThinking;
                  hasThinkingDeltaInEvent = true;
                }
              }

              if (typeof signature === 'string' && signature.length > 0) {
                if (!textStarted && contentBlockOpen && currentBlockType === 'thinking' && signature !== lastSignature) {
                  const sigEvt = { type: 'content_block_delta', index: contentBlockIndex, delta: { type: 'signature_delta', signature } };
                  controller.enqueue(enc.encode(`event: content_block_delta\n`));
                  controller.enqueue(enc.encode(`data: ${JSON.stringify(sigEvt)}\n\n`));
                  lastSignature = signature;
                }
              }

              // Handle assistant text（忽略 thought===true 的文本，它属于思考）
              if (part?.text && part?.thought !== true) {
                // 如果本事件包含思考delta且文本尚未开始，则缓存文本到下一事件输出
                if (!textStarted && hasThinkingDeltaInEvent) {
                  pendingTextChunks.push(part.text);
                  continue;
                }
                if (!contentBlockOpen || currentBlockType !== 'text') {
                  if (contentBlockOpen) {
                    controller.enqueue(enc.encode(`event: content_block_stop\n`));
                    controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex })}\n\n`));
                    contentBlockIndex++;
                  }
                  const startBlock = { 
                    type: 'content_block_start', 
                    index: contentBlockIndex, 
                    content_block: { type: 'text', text: '' } 
                  };
                  controller.enqueue(enc.encode(`event: content_block_start\n`));
                  controller.enqueue(enc.encode(`data: ${JSON.stringify(startBlock)}\n\n`));
                  contentBlockOpen = true;
                  currentBlockType = 'text';
                  textStarted = true;
                }
                const deltaEvt = { 
                  type: 'content_block_delta', 
                  index: contentBlockIndex, 
                  delta: { type: 'text_delta', text: part.text } 
                };
                controller.enqueue(enc.encode(`event: content_block_delta\n`));
                controller.enqueue(enc.encode(`data: ${JSON.stringify(deltaEvt)}\n\n`));
              }
              
              // Handle tool calls
              if (part?.functionCall) {
                if (contentBlockOpen) {
                  controller.enqueue(enc.encode(`event: content_block_stop\n`));
                  controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex })}\n\n`));
                  contentBlockOpen = false;
                  currentBlockType = null;
                  contentBlockIndex++;
                }
                const toolUseId = `toolu_${self.generateUUID().replace(/-/g, '').slice(0, 24)}`;
                const toolStart = { 
                  type: 'content_block_start', 
                  index: contentBlockIndex, 
                  content_block: { 
                    type: 'tool_use', 
                    id: toolUseId, 
                    name: part.functionCall.name, 
                    input: {} 
                  } 
                };
                controller.enqueue(enc.encode(`event: content_block_start\n`));
                controller.enqueue(enc.encode(`data: ${JSON.stringify(toolStart)}\n\n`));
                
                if (part.functionCall.args) {
                  const toolDelta = { 
                    type: 'content_block_delta', 
                    index: contentBlockIndex, 
                    delta: { 
                      type: 'input_json_delta', 
                      partial_json: JSON.stringify(part.functionCall.args) 
                    } 
                  };
                  controller.enqueue(enc.encode(`event: content_block_delta\n`));
                  controller.enqueue(enc.encode(`data: ${JSON.stringify(toolDelta)}\n\n`));
                }
                
                controller.enqueue(enc.encode(`event: content_block_stop\n`));
                controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex })}\n\n`));
                contentBlockIndex++;
              }
            }

            // 如果本事件没有思考delta且存在缓存文本，并且尚未开始文本阶段，则一次性输出缓存文本
            if (!textStarted && pendingTextChunks.length > 0 && !hasThinkingDeltaInEvent) {
              if (contentBlockOpen) {
                controller.enqueue(enc.encode(`event: content_block_stop\n`));
                controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex })}\n\n`));
                contentBlockIndex++;
              }
              const startBlock = { 
                type: 'content_block_start', 
                index: contentBlockIndex, 
                content_block: { type: 'text', text: '' } 
              };
              controller.enqueue(enc.encode(`event: content_block_start\n`));
              controller.enqueue(enc.encode(`data: ${JSON.stringify(startBlock)}\n\n`));
              contentBlockOpen = true;
              currentBlockType = 'text';
              textStarted = true;
              for (const chunk of pendingTextChunks.splice(0)) {
                const deltaEvt = { 
                  type: 'content_block_delta', 
                  index: contentBlockIndex, 
                  delta: { type: 'text_delta', text: chunk } 
                };
                controller.enqueue(enc.encode(`event: content_block_delta\n`));
                controller.enqueue(enc.encode(`data: ${JSON.stringify(deltaEvt)}\n\n`));
              }
            }

            const fr = cand?.finishReason;
            if (!tailEmitted && (fr === 'STOP' || fr === 'MAX_TOKENS')) {
              if (contentBlockOpen) {
                controller.enqueue(enc.encode(`event: content_block_stop\n`));
                controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex })}\n\n`));
                contentBlockOpen = false;
                currentBlockType = null;
              }
              const stop_reason = fr === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn';
              const thinkingTime = firstTokenAt && messageStartAt ? Math.max(1, firstTokenAt - messageStartAt) : undefined;
              const msgDelta = { 
                type: 'message_delta', 
                delta: { stop_reason, stop_sequence: null }, 
                usage: { input_tokens: totalInput, output_tokens: totalOutput, ...(thinkingTime !== undefined ? { thinking_time_ms: thinkingTime } : {}) } 
              };
              controller.enqueue(enc.encode(`event: message_delta\n`));
              controller.enqueue(enc.encode(`data: ${JSON.stringify(msgDelta)}\n\n`));
              controller.enqueue(enc.encode(`event: message_stop\n`));
              controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'message_stop' })}\n\n`));
              tailEmitted = true;
            }
          } catch { }
        }
      },
      
      flush(controller) {
        if (!started) return;
        if (contentBlockOpen) {
          controller.enqueue(enc.encode(`event: content_block_stop\n`));
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex })}\n\n`));
        }
        // flush 时如果还有积压文本，尽量输出
        if (pendingTextChunks.length > 0) {
          const startBlock = { 
            type: 'content_block_start', 
            index: contentBlockIndex, 
            content_block: { type: 'text', text: '' } 
          };
          controller.enqueue(enc.encode(`event: content_block_start\n`));
          controller.enqueue(enc.encode(`data: ${JSON.stringify(startBlock)}\n\n`));
          for (const chunk of pendingTextChunks.splice(0)) {
            const deltaEvt = { 
              type: 'content_block_delta', 
              index: contentBlockIndex, 
              delta: { type: 'text_delta', text: chunk } 
            };
            controller.enqueue(enc.encode(`event: content_block_delta\n`));
            controller.enqueue(enc.encode(`data: ${JSON.stringify(deltaEvt)}\n\n`));
          }
          controller.enqueue(enc.encode(`event: content_block_stop\n`));
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex })}\n\n`));
        }
        if (!tailEmitted) {
          const msgDelta = { 
            type: 'message_delta', 
            delta: { stop_reason: 'end_turn', stop_sequence: null }, 
            usage: { output_tokens: totalOutput } 
          };
          controller.enqueue(enc.encode(`event: message_delta\n`));
          controller.enqueue(enc.encode(`data: ${JSON.stringify(msgDelta)}\n\n`));
          controller.enqueue(enc.encode(`event: message_stop\n`));
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'message_stop' })}\n\n`));
        }
        controller.enqueue(enc.encode('data: [DONE]\n\n'));
      },
    });
  }

  // 弹性Claude流：立即发出前奏，代理上游；如果在超时内没有数据，发出最小文本以避免客户端挂起
  private resilientClaudeStream(
    upstreamFactory: () => Promise<Response>,
    model: string,
    attemptTimeoutMs = 3000,
    maxRetries = 2
  ): ReadableStream<Uint8Array> {
    const enc = new TextEncoder();
    const self = this;
    
    const prelude = (controller: ReadableStreamDefaultController<Uint8Array>, messageId: string) => {
      const startEvt = { 
        type: 'message_start', 
        message: { 
          id: messageId, 
          type: 'message', 
          role: 'assistant', 
          content: [], 
          model, 
          stop_reason: null, 
          stop_sequence: null, 
          usage: { input_tokens: 0, output_tokens: 0 } 
        } 
      };
      controller.enqueue(enc.encode(`event: message_start\n`));
      controller.enqueue(enc.encode(`data: ${self.json(startEvt)}\n\n`));
      controller.enqueue(enc.encode(`event: ping\n`));
      controller.enqueue(enc.encode(`data: ${self.json({ type: 'ping' })}\n\n`));
    };

    const tailOk = (controller: ReadableStreamDefaultController<Uint8Array>, usageOut = 0) => {
      controller.enqueue(enc.encode(`event: message_delta\n`));
      controller.enqueue(enc.encode(`data: ${self.json({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: usageOut } })}\n\n`));
      controller.enqueue(enc.encode(`event: message_stop\n`));
      controller.enqueue(enc.encode(`data: ${self.json({ type: 'message_stop' })}\n\n`));
      controller.enqueue(enc.encode('data: [DONE]\n\n'));
    };

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        const msgId = `msg_${self.generateUUID()}`;
        prelude(controller, msgId);

        let attempt = 0;
        let receivedAny = false;

        while (attempt <= maxRetries && !receivedAny) {
          try {
            const resp = await upstreamFactory();
            if (!resp.ok || !resp.body) throw new Error(`upstream ${resp.status}`);

            const transformed = resp.body.pipeThrough(self.createClaudeStreamTransformer(model, { emitPrelude: false }) as any);
            const reader = transformed.getReader();

            let timedOut = false;
            const timer = setTimeout(() => { timedOut = true; }, attemptTimeoutMs);

            // 泵送几个块；如果第一个块到达，继续而不超时门
            const pump = async (): Promise<void> => {
              const { value, done } = await reader.read();
              if (done) return;
              if (value && (value as Uint8Array).byteLength > 0) {
                receivedAny = true;
                clearTimeout(timer);
                controller.enqueue(value as Uint8Array);
              }
              await pump();
            };

            await Promise.race([
              pump(),
              (async () => {
                while (!timedOut && !receivedAny) await new Promise(r => setTimeout(r, 50));
              })()
            ]);

            if (!receivedAny) {
              // 取消并重试
              try { reader.cancel(); } catch { }
              attempt++;
              continue;
            }

            // 在第一个字节后，流式传输其余部分直到结束
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) controller.enqueue(value as Uint8Array);
            }
            // 转换器flush将发出尾部；只需返回
            controller.close();
            return;
          } catch {
            attempt++;
          }
        }

        if (!receivedAny) {
          // 发出最小文本以满足客户端流期望
          controller.enqueue(enc.encode(`event: content_block_start\n`));
          controller.enqueue(enc.encode(`data: ${self.json({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })}\n\n`));
          controller.enqueue(enc.encode(`event: content_block_delta\n`));
          controller.enqueue(enc.encode(`data: ${self.json({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' ' } })}\n\n`));
          controller.enqueue(enc.encode(`event: content_block_stop\n`));
          controller.enqueue(enc.encode(`data: ${self.json({ type: 'content_block_stop', index: 0 })}\n\n`));
          tailOk(controller, 0);
        }
        controller.close();
      }
    });
  }

  // 创建简单的流式响应（不带弹性处理）
  async createSimpleStream(claudeRequest: ClaudeRequest): Promise<Response> {
    try {
      const requestId = this.getRequestId();
      const geminiData = this.claudeToGemini(claudeRequest);
      
      const endpoint = `models/${geminiData.model}:streamGenerateContent?alt=sse`;
      const response = await fetch(`${this.BASE_URL}/${this.API_VERSION}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'x-goog-api-key': this.config.apiKey,
        },
        body: this.json(geminiData.body),
      });

      if (!response.ok) {
        const txt = await response.text();
        const msg = this.safeExtractGeminiError(txt) || 'Upstream error';
        return new Response(
          this.json(this.anthropicError(response.status, msg)), 
          { 
            status: response.status, 
            headers: { 
              ...this.jsonHeaders(), 
              'x-request-id': requestId 
            } 
          }
        );
      }

      const transformedStream = response.body!.pipeThrough(
        this.createClaudeStreamTransformer(claudeRequest.model || 'claude')
      );

      return new Response(transformedStream as any, { 
        status: 200, 
        headers: { 
          ...this.sseHeaders(), 
          'x-request-id': requestId 
        } 
      });
    } catch (e: any) {
      return this.handleError(e);
    }
  }
}