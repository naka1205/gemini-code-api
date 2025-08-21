// Claude消息适配器
// 实现Claude API到Gemini API的转换

import { ClaudeCore, ClaudeHttpError } from './core';
import type { ClaudeRequest, ClaudeResponse, GeminiClaudeRequest, GeminiClaudeResponse } from '../../types/claude';

export class ClaudeMessagesAdapter extends ClaudeCore {
  constructor(config: { apiKey: string }) {
    super(config);
  }

  // 创建Claude消息请求
  async create(request: ClaudeRequest): Promise<Response> {
    try {
      // 转换Claude请求到Gemini请求
      const geminiRequest = this.convertClaudeToGemini(request);
      
      // 调用Gemini API
      const response = await this.callGeminiAPI(geminiRequest, request.model);
      
      // 转换Gemini响应到Claude响应
      const claudeResponse = this.convertGeminiToClaude(response, request.model);
      
      // 添加响应头
      const headers = new Headers({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'anthropic-version': '2023-06-01',
        'x-real-model': this.mapClaudeToGeminiModel(request.model),
        'x-requested-model': request.model
      });

      return new Response(JSON.stringify(claudeResponse), {
        status: 200,
        headers
      });

    } catch (error) {
      return this.handleError(error);
    }
  }

  // 转换Claude请求到Gemini请求
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

  // 调用Gemini API
  private async callGeminiAPI(geminiRequest: GeminiClaudeRequest, originalModel: string): Promise<GeminiClaudeResponse> {
    const geminiModel = this.mapClaudeToGeminiModel(originalModel);
    const endpoint = `models/${encodeURIComponent(geminiModel)}:generateContent`;
    
    const response = await this.makeRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        contents: geminiRequest.contents,
        systemInstruction: geminiRequest.systemInstruction,
        generationConfig: geminiRequest.generationConfig,
        tools: geminiRequest.tools,
        toolConfig: geminiRequest.toolConfig,
        safetySettings: this.getSafetySettings()
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Gemini API request failed';
      
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error?.message || errorMessage;
      } catch {}

      throw new ClaudeHttpError(errorMessage, response.status);
    }

    return await response.json();
  }

  // 转换Gemini响应到Claude响应
  private convertGeminiToClaude(gemini: GeminiClaudeResponse, model: string): ClaudeResponse {
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
    const content: any[] = [];
    let stopReason = 'end_turn';

    // 处理内容部分
    if (cand?.content?.parts) {
      for (const part of cand.content.parts) {
        if (part?.text) {
          content.push({ type: 'text', text: part.text });
        }
        if (part?.functionCall) {
          const toolUseId = `toolu_${this.generateUUID().replace(/-/g, '').slice(0, 24)}`;
          content.push({ 
            type: 'tool_use', 
            id: toolUseId, 
            name: part.functionCall.name, 
            input: part.functionCall.args || {} 
          });
          stopReason = 'tool_use';
        }
      }
    }

    // 确定停止原因
    if (cand?.finishReason === 'MAX_TOKENS') {
      stopReason = 'max_tokens';
    } else if (cand?.finishReason === 'STOP') {
      stopReason = content.some((c) => c.type === 'tool_use') ? 'tool_use' : 'end_turn';
    } else if (cand?.finishReason && cand.finishReason !== 'STOP') {
      stopReason = 'error';
    }

    // 使用情况统计
    const usage = {
      input_tokens: gemini?.usageMetadata?.promptTokenCount || 0,
      output_tokens: gemini?.usageMetadata?.candidatesTokenCount || 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    };

    return {
      id: msgId,
      type: 'message',
      role: 'assistant',
      content,
      model,
      stop_reason: stopReason as any,
      stop_sequence: null,
      usage
    };
  }
}
