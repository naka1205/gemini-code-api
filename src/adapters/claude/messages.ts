// Claude消息处理适配器模块
// 处理非流式消息请求

import { ClaudeCore } from './core';
import type {
  ClaudeRequest,
  ClaudeResponse,
  ClaudeMessage,
  ContentBlock,
  ClaudeTool,
  GeminiClaudeRequest,
  GeminiClaudeResponse
} from '../../types/claude';

export class ClaudeMessagesAdapter extends ClaudeCore {

  // 处理消息创建请求
  async create(claudeRequest: ClaudeRequest): Promise<Response> {
    try {
      const apiStartedAt = Date.now();
      const geminiData = this.claudeToGemini(claudeRequest);
      const endpoint = `models/${geminiData.model}:generateContent?key=${encodeURIComponent(this.config.apiKey)}`;

      const response = await fetch(`${this.BASE_URL}/${this.API_VERSION}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: this.json(geminiData.body),
      });

      const txt = await response.text();
      if (!response.ok) {
        const msg = this.safeExtractGeminiError(txt) || 'Upstream error';
        return new Response(
          this.json(this.anthropicError(response.status, msg)),
          {
            status: response.status,
            headers: this.jsonHeaders()
          }
        );
      }

      const payload = txt ? JSON.parse(txt) : {};
      const result = this.geminiToClaude(payload, claudeRequest.model || 'claude');
      // 回填用时（毫秒）以避免客户端显示0.0秒
      try {
        const elapsed = Date.now() - apiStartedAt;
        if (result && (result as any).usage) {
          const t = (result as any).usage.thinking_time_ms;
          if (!(typeof t === 'number' && t > 0)) {
            (result as any).usage.thinking_time_ms = Math.max(1, elapsed);
          }
        }
      } catch {}
      
      // 添加真实的Gemini模型信息到响应头中，供日志记录使用
      const responseHeaders = {
        ...this.jsonHeaders(),
        'x-real-model': geminiData.model,
        'x-requested-model': claudeRequest.model || 'claude'
      };
      
      return new Response(
        this.json(result),
        {
          status: 200,
          headers: responseHeaders
        }
      );
    } catch (e: any) {
      return this.handleError(e);
    }
  }

  // 转换Claude请求到Gemini格式
  private claudeToGemini(claudeRequest: ClaudeRequest): { model: string; body: GeminiClaudeRequest; stream: boolean } {
    const {
      model,
      messages,
      stream = false,
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
        // 允许在消息中嵌入系统消息
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

    // 生成配置
    const generationConfig: any = {
      maxOutputTokens: max_tokens,
      temperature
    };
    if (typeof top_p === 'number') generationConfig.topP = top_p;
    if (typeof top_k === 'number') generationConfig.topK = top_k;
    if (Array.isArray(stop_sequences) && stop_sequences.length > 0) generationConfig.stopSequences = stop_sequences;

    const body: GeminiClaudeRequest = {
      contents,
      generationConfig
    };
    if (systemInstruction) body.systemInstruction = systemInstruction;

    // 思考预算映射（默认启用，除非显式 disabled）
    const enableThinking = !thinking || thinking?.type !== 'disabled';
    if (enableThinking) {
      const budget = typeof thinking?.budget_tokens === 'number' ? thinking.budget_tokens : 8192;
      (generationConfig as any).thinkingConfig = {
        includeThoughts: true,
        thinkingBudget: Math.max(1024, Math.min(max_tokens - 1, budget))
      };
    }

    // 处理工具
    if (Array.isArray(tools) && tools.length > 0) {
      const functionDeclarations = tools.map((t: ClaudeTool) => {
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

  // 转换Gemini响应到Claude格式
  private geminiToClaude(gemini: GeminiClaudeResponse, model: string): ClaudeResponse {
    const msgId = `msg_${this.generateUUID()}`;

    if (!gemini || !Array.isArray(gemini?.candidates) || gemini.candidates.length === 0) {
      return {
        id: msgId,
        type: 'message',
        role: 'assistant',
        content: [],
        model,
        stop_reason: 'error',
        stop_sequence: null,
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0
        },
      };
    }

    const cand = gemini.candidates[0];
    const content: ContentBlock[] = [];
    let stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | 'error' = 'end_turn';

    // 先处理候选级别的思考（Gemini 原生 thought 字段）
    const candidateThought: string | undefined = (cand as any)?.thought;
    const hasCandidateThought = typeof candidateThought === 'string' && candidateThought.length > 0;
    if (hasCandidateThought) {
      content.push({
        type: 'thinking',
        thinking: candidateThought!
      } as any);
    }

    if (cand?.content?.parts) {
      const thinkingBlocks: ContentBlock[] = [];
      const textBlocks: ContentBlock[] = [];
      const toolBlocks: ContentBlock[] = [];
      const seenThinking = new Set<string>();
      const seenRedacted = new Set<string>();
      for (const part of cand.content.parts) {
        // thinking / redacted_thinking 映射
        // 检查part.thought是否为布尔值，如果是true则使用part.text作为思考内容
        let thinkingText: string | undefined;
        if (part?.thought === true && part?.text) {
          thinkingText = part.text;
        } else {
          thinkingText = part?.thinking || part?.internalThought;
        }
        
        const redactedThinking: string | undefined = part?.redacted_thinking || part?.redactedThinking;
        const signature: string | undefined = part?.signature;

        // 当候选级思考已存在时，跳过part级thinking，避免重复
        if (!hasCandidateThought && typeof thinkingText === 'string' && thinkingText.length > 0) {
          if (!seenThinking.has(thinkingText)) {
            const thinkingBlock: any = { type: 'thinking', thinking: thinkingText };
            if (signature) thinkingBlock.signature = signature;
            thinkingBlocks.push(thinkingBlock);
            seenThinking.add(thinkingText);
          }
        }
        if (typeof redactedThinking === 'string' && redactedThinking.length > 0) {
          if (!seenRedacted.has(redactedThinking)) {
            const redactedBlock: any = { type: 'redacted_thinking', thinking: redactedThinking };
            if (signature) redactedBlock.signature = signature;
            thinkingBlocks.push(redactedBlock);
            seenRedacted.add(redactedThinking);
          }
        }

        // 只有当part不是思考内容时，才将text作为普通文本添加
        if (part?.text && part?.thought !== true) {
          textBlocks.push({
            type: 'text',
            text: part.text
          });
        }

        if (part?.functionCall) {
          const toolUseId = `toolu_${this.generateUUID().replace(/-/g, '').slice(0, 24)}`;
          toolBlocks.push({
            type: 'tool_use',
            id: toolUseId,
            name: part.functionCall.name,
            input: part.functionCall.args || {}
          } as any);
          stopReason = 'tool_use';
        }
      }
      // 输出顺序：thinking 与 redacted_thinking 在前，然后文本，再工具
      if (hasCandidateThought) {
        // 候选级思考已放入 content 最前；仅追加其他思考类型（例如 redacted）和后续文本/工具
        content.push(...thinkingBlocks.filter(b => b.type === 'redacted_thinking'));
      } else {
        content.push(...thinkingBlocks);
      }
      content.push(...textBlocks);
      content.push(...toolBlocks);
    }

    // 处理完成原因
    if (cand?.finishReason === 'MAX_TOKENS') {
      stopReason = 'max_tokens';
    } else if (cand?.finishReason === 'STOP') {
      stopReason = content.some((c) => c.type === 'tool_use') ? 'tool_use' : 'end_turn';
    } else if (cand?.finishReason && cand.finishReason !== 'STOP') {
      stopReason = 'error';
    }

    // 计算thinking_time_ms：基于thoughtsTokenCount估算思考时间（始终返回数值，至少0），参考文档建议进行可观测性
    let thinkingTimeMs: number | undefined;
    const thoughtsTokenCount = gemini?.usageMetadata?.thoughtsTokenCount || gemini?.usageMetadata?.thinkingTokenCount;
    if (typeof thoughtsTokenCount === 'number') {
      thinkingTimeMs = Math.max(0, Math.round(thoughtsTokenCount * 1.5));
    } else {
      // 无法获取则用首token延迟近似
      thinkingTimeMs = 0;
    }

    const usage = {
      input_tokens: typeof gemini?.usageMetadata?.promptTokenCount === 'number' ? gemini.usageMetadata.promptTokenCount : 0,
      output_tokens: typeof gemini?.usageMetadata?.candidatesTokenCount === 'number' ? gemini.usageMetadata.candidatesTokenCount : 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      thinking_time_ms: thinkingTimeMs
    } as any;

    return {
      id: msgId,
      type: 'message',
      role: 'assistant',
      content,
      model,
      stop_reason: stopReason,
      stop_sequence: null,
      usage
    };
  }

  // 验证Claude请求
  private validateClaudeRequest(request: ClaudeRequest): void {
    if (!request.model) {
      throw new Error('Model is required');
    }

    if (!request.messages || !Array.isArray(request.messages) || request.messages.length === 0) {
      throw new Error('Messages array is required and cannot be empty');
    }

    if (!request.max_tokens || request.max_tokens <= 0) {
      throw new Error('max_tokens must be a positive integer');
    }

    if (request.max_tokens > 8192) {
      throw new Error('max_tokens cannot exceed 8192');
    }

    if (request.temperature !== undefined && (request.temperature < 0 || request.temperature > 2)) {
      throw new Error('temperature must be between 0 and 2');
    }

    if (request.top_p !== undefined && (request.top_p < 0 || request.top_p > 1)) {
      throw new Error('top_p must be between 0 and 1');
    }

    if (request.top_k !== undefined && request.top_k <= 0) {
      throw new Error('top_k must be a positive integer');
    }
  }

  // 创建带验证的消息
  async createWithValidation(request: ClaudeRequest): Promise<Response> {
    try {
      this.validateClaudeRequest(request);
      return await this.create(request);
    } catch (err: any) {
      return this.handleError(err);
    }
  }


}