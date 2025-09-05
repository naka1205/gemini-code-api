// src/logic/transformers/claude.ts
import { ITransformer } from './base';
import { getGeminiModel } from '../../config/models';
import { ErrorTransformer } from './error';
import { StreamingProcessor } from '../processors';

/**
 * Claude数据转换器 - 参照bak目录逻辑重写
 * 移植了bak目录中经过验证的转换逻辑，确保工具调用历史的正确处理
 */
export class ClaudeTransformer implements ITransformer {
  transformRequest(data: any): { model: string; body: any; isStreaming: boolean } {
    const geminiModel = getGeminiModel(data.model);

    const contents = this.convertMessages(data.messages, data.system);
    const generationConfig = this.convertGenerationConfig(data);
    const tools = this.convertTools(data.tools);
    const toolConfig = this.convertToolChoice(data.tool_choice);

    const geminiRequest: any = {
      contents,
      generationConfig,
    };

    if (tools) {
      geminiRequest.tools = tools;
    }
    if (toolConfig) {
      geminiRequest.toolConfig = toolConfig;
    }

    return {
      model: geminiModel,
      body: geminiRequest,
      isStreaming: data.stream === true,
    };
  }

  async transformResponse(geminiResponse: any, originalRequest: any): Promise<Response> {
    try {
      if (originalRequest.stream) {
        if (!geminiResponse.body) {
          throw new Error('Streaming response has no body');
        }
        const transformedStream = StreamingProcessor.createClaudeStreamTransformer(geminiResponse.body, originalRequest);
        return new Response(transformedStream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      }

      const responseData = await geminiResponse.json();
      if (!geminiResponse.ok) {
        const geminiError = ErrorTransformer.parseGeminiError({ error: responseData.error });
        return ErrorTransformer.createErrorResponse(geminiError, 'claude');
      }

      const candidate = responseData.candidates?.[0];
      if (!candidate) {
        const error = { code: 'NO_CANDIDATES', message: 'No candidate found in Gemini response' };
        return ErrorTransformer.createErrorResponse(error, 'claude');
      }

      const claudeContent = this.convertGeminiContent(candidate.content);
      const stopReason = this.mapStopReason(candidate.finishReason, claudeContent);

      const claudeResponse = {
        id: 'msg_' + Date.now(),
        type: 'message',
        role: 'assistant',
        content: claudeContent,
        model: originalRequest.model,
        stop_reason: stopReason,
        stop_sequence: null,
        usage: {
          input_tokens: responseData.usageMetadata?.promptTokenCount || 0,
          output_tokens: responseData.usageMetadata?.candidatesTokenCount || 0,
        },
      };

      return new Response(JSON.stringify(claudeResponse), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error: any) {
      const transformError = { code: 'TRANSFORM_ERROR', message: error.message || 'Response transformation failed' };
      return ErrorTransformer.createErrorResponse(transformError, 'claude');
    }
  }

  // --- 移植自 bak/adapters/claude/transformer.ts ---

  private convertMessages(messages: any[], system?: string): any[] {
    const contents: any[] = [];
    const toolUseIdToNameMap: Record<string, string> = {};

    if (system) {
        messages.unshift({ role: 'user', content: [{ type: 'text', text: system }] });
    }

    for (const message of messages) {
        const geminiRole = message.role === 'assistant' ? 'model' : 'user';
        const contentParts = Array.isArray(message.content) ? message.content : [{ type: 'text', text: message.content }];
        const geminiParts: any[] = [];

        for (const part of contentParts) {
            switch (part.type) {
                case 'text':
                    if (part.text) geminiParts.push({ text: part.text });
                    break;
                case 'tool_use':
                    toolUseIdToNameMap[part.id] = part.name;
                    geminiParts.push({ functionCall: { name: part.name, args: part.input } });
                    break;
                case 'tool_result':
                    const functionName = toolUseIdToNameMap[part.tool_use_id];
                    if (functionName) {
                        geminiParts.push({ functionResponse: { name: functionName, response: { content: part.content } } });
                    }
                    break;
            }
        }
        if (geminiParts.length > 0) {
            contents.push({ role: geminiRole, parts: geminiParts });
        }
    }
    return contents;
  }

  private convertGenerationConfig(data: any): any {
    const requestedMax = Math.max(0, Number(data.max_tokens || 0));
    const defaultMax = 2048;
    const maxOutputTokens = requestedMax > 0 ? requestedMax : defaultMax;

    const config: any = {
      maxOutputTokens: maxOutputTokens,
    };
    if (data.temperature !== undefined) config.temperature = data.temperature;
    if (data.top_p !== undefined) config.topP = data.top_p;
    if (data.top_k !== undefined) config.topK = data.top_k;
    if (data.stop_sequences) config.stopSequences = data.stop_sequences;
    return config;
  }

  private convertTools(tools?: any[]): any[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return [{
      functionDeclarations: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: this.cleanJsonSchema(tool.input_schema),
      })),
    }];
  }

  private convertToolChoice(tool_choice?: any): any | undefined {
    if (!tool_choice) return undefined;
    let mode: 'AUTO' | 'ANY' | 'NONE' = 'AUTO';
    let allowedFunctionNames: string[] | undefined = undefined;

    if (typeof tool_choice === 'string') {
      if (tool_choice === 'auto') mode = 'AUTO';
      else if (tool_choice === 'none') mode = 'NONE';
    } else if (tool_choice.type === 'tool' && tool_choice.name) {
      mode = 'ANY';
      allowedFunctionNames = [tool_choice.name];
    }
    return { functionCallingConfig: { mode, ...(allowedFunctionNames && { allowedFunctionNames }) } };
  }

  private cleanJsonSchema(schema: any): any {
    if (!schema || typeof schema !== 'object') return schema;
    const cleaned = JSON.parse(JSON.stringify(schema));
    const clean = (obj: any): any => {
      if (!obj || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(clean);
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (key === 'additionalProperties' || key === '$schema') continue;
        result[key] = clean(value);
      }
      return result;
    };
    return clean(cleaned);
  }

  private convertGeminiContent(geminiContent: any): any[] {
    const claudeContent: any[] = [];
    if (geminiContent?.parts && Array.isArray(geminiContent.parts)) {
      for (const part of geminiContent.parts) {
        if (part.text) {
          claudeContent.push({ type: 'text', text: part.text });
        }
        if (part.functionCall) {
          claudeContent.push({
            type: 'tool_use',
            id: `toolu_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
            name: part.functionCall.name,
            input: part.functionCall.args || {},
          });
        }
      }
    }
    if (claudeContent.length === 0) {
      claudeContent.push({ type: 'text', text: '' });
    }
    return claudeContent;
  }

  private mapStopReason(geminiReason?: string, claudeContent?: any[]): string {
    if (claudeContent?.some(item => item.type === 'tool_use')) {
      return 'tool_use';
    }
    switch (geminiReason) {
      case 'STOP': return 'end_turn';
      case 'MAX_TOKENS': return 'max_tokens';
      case 'TOOL_CALL': return 'tool_use';
      default: return 'end_turn';
    }
  }
}
