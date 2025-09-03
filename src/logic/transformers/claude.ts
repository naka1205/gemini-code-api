// src/logic/transformers/claude.ts
import { ITransformer } from './base';
import { ErrorTransformer } from './error';
import { getGeminiModel } from '../../config/models';

/**
 * Claude数据转换器 - 基于原版逻辑优化
 * 统一处理Claude到Gemini的数据结构转换
 */
export class ClaudeTransformer implements ITransformer {
  
  /**
   * 将Claude请求转换为Gemini格式
   * 基于原版的统一转换逻辑
   */
  transformRequest(data: any): { model: string; body: any; isStreaming: boolean; } {
    // 1. 映射模型名称
    const geminiModel = getGeminiModel(data.model);
    const supportsThinking = this.isThinkingSupportedModel(geminiModel);
    
    // 2. 转换消息和系统提示
    const contents = this.convertMessages(data.messages, data.system);
    
    // 3. 转换生成配置（设置稳健默认值）
    const requestedMax = Math.max(0, Number(data.max_tokens || 0));
    const defaultMax = 1024; // 合理默认，避免频繁触顶
    const maxOutputTokens = requestedMax > 0 ? requestedMax : defaultMax;
    const generationConfig: any = {
      maxOutputTokens,
    };

    // 4. 处理 Extended Thinking 参数（仅 2.5 支持）
    const claudeThinkingEnabled = data.thinking?.type === "enabled";
    
    // 添加调试日志
    console.log(`[CLAUDE DEBUG] Model: ${geminiModel}, Thinking: ${data.thinking?.type || 'undefined'}, Max tokens: ${maxOutputTokens}`);
    
    if (supportsThinking) {
      if (claudeThinkingEnabled) {
        // 用户明确启用thinking
        const rawBudget = data.thinking?.budget_tokens ?? 8192;
        const capByMax = Math.floor(maxOutputTokens * 0.33);
        const thinkingBudget = Math.max(256, Math.min(rawBudget, Math.max(256, capByMax)));
        generationConfig.thinkingConfig = {
          includeThoughts: true,
          thinkingBudget
        };
        console.log(`[CLAUDE DEBUG] Thinking enabled with budget: ${thinkingBudget}`);
      } else {
        // 🎯 关键修复：根据Google官方文档，禁用thinking的正确方法是设置 thinkingBudget: 0
        generationConfig.thinkingConfig = {
          thinkingBudget: 0  // 这会完全禁用thinking
        };
        console.log(`[CLAUDE DEBUG] Thinking disabled using thinkingBudget: 0`);
      }
    } else {
      // 非 2.5 模型：不注入任何 thinkingConfig，避免报错
      console.log(`[CLAUDE DEBUG] Model doesn't support thinking`);
    }

    // 5. 处理其他参数（归一化与裁剪）
    const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max);

    if (data.temperature !== undefined) {
      const t = Number(data.temperature);
      if (!Number.isNaN(t)) generationConfig.temperature = clamp(t, 0, 2);
    }

    if (data.top_p !== undefined) {
      const p = Number(data.top_p);
      if (!Number.isNaN(p)) generationConfig.topP = clamp(p, 0, 1);
    }

    if (data.top_k !== undefined) {
      const k = Math.floor(Number(data.top_k));
      if (!Number.isNaN(k)) generationConfig.topK = clamp(k, 1, 1000);
    }

    if (data.stop_sequences && Array.isArray(data.stop_sequences)) {
      const cleaned = data.stop_sequences
        .filter((s: any) => typeof s === 'string' && s.length > 0)
        .slice(0, 8) // 限制上限，避免过多停止序列
        .map((s: string) => s.slice(0, 120)); // 过长截断
      if (cleaned.length > 0) generationConfig.stopSequences = cleaned;
    }

    // 6. 转换工具
    const geminiTools = this.convertTools(data.tools);

    // 7. 转换工具选择
    const geminiToolConfig = this.convertToolChoice(data.tool_choice);
    
    const geminiRequest: any = {
      contents,
      generationConfig,
    };

    // 添加最终配置日志
    console.log(`[CLAUDE DEBUG] Final generationConfig:`, JSON.stringify(generationConfig, null, 2));

    if (geminiTools && geminiTools.length > 0) {
      geminiRequest.tools = geminiTools;
    }

    if (geminiToolConfig) {
      geminiRequest.toolConfig = geminiToolConfig;
    }
    
    return {
      model: geminiModel,
      body: geminiRequest,
      isStreaming: data.stream === true,
    };
  }

  /**
   * 将Gemini响应转换为Claude格式
   * 基于原版的完整响应转换逻辑
   */
  async transformResponse(geminiResponse: any, originalRequest: any): Promise<Response> {
    try {
      if (originalRequest.stream) {
        if (!geminiResponse.body) {
          throw new Error('Streaming response has no body');
        }
        
        // 创建流式转换器（保持现有的流式处理逻辑）
        const transformedStream = this.createClaudeStreamTransformer(
          geminiResponse.body, 
          originalRequest
        );
        
        return new Response(transformedStream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'x-powered-by': 'gemini-code-api'
          },
        });
      }

      // 处理非流式响应
      const responseData = await geminiResponse.json();
      console.log(`[CLAUDE DEBUG] Gemini response status:`, geminiResponse.status);
      console.log(`[CLAUDE DEBUG] Gemini response data:`, JSON.stringify(responseData, null, 2));
      
      if (!geminiResponse.ok) {
        const geminiError = ErrorTransformer.parseGeminiError({ error: responseData.error });
        return ErrorTransformer.createErrorResponse(geminiError, 'claude');
      }

      const candidate = responseData.candidates?.[0];
      console.log(`[CLAUDE DEBUG] Candidate:`, JSON.stringify(candidate, null, 2));
      
      if (!candidate) {
        console.log(`[CLAUDE DEBUG] No candidate found in response`);
        const error = { code: 'NO_CANDIDATES', message: 'No candidate found in Gemini response' };
        return ErrorTransformer.createErrorResponse(error, 'claude');
      }

      // 使用原版的响应转换逻辑
      const claudeThinkingEnabled = originalRequest.thinking?.type === 'enabled';
      const claudeContent = this.convertGeminiResponseToClaude(candidate, claudeThinkingEnabled);
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
        headers: { 
          'Content-Type': 'application/json',
          'x-powered-by': 'gemini-code-api'
        },
      });
    } catch (error: any) {
      const geminiError = { code: 'TRANSFORM_ERROR', message: error.message || 'Response transformation failed' };
      return ErrorTransformer.createErrorResponse(geminiError, 'claude');
    }
  }

  // --- 私有辅助方法 (基于原版逻辑) ---

  /**
   * 检查模型是否支持思考功能
   */
  private isThinkingSupportedModel(model: string): boolean {
    return model.includes('2.5');
  }

  /**
   * 转换消息格式
   */
  private convertMessages(messages: { role: 'user' | 'assistant'; content: any }[], system?: string): any[] {
    const contents: any[] = [];
    let systemPromptProcessed = false;

    // 将系统提示作为第一个 user message 的一部分
    if (system) {
      const firstUserMessageIndex = messages.findIndex(m => m.role === 'user');
      if (firstUserMessageIndex !== -1) {
        const originalContent = this.extractTextFromContent(messages[firstUserMessageIndex].content);
        messages[firstUserMessageIndex].content = `${system}\n\n${originalContent}`;
        systemPromptProcessed = true;
      }
    }

    for (const message of messages) {
      contents.push({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: this.extractTextFromContent(message.content) }],
      });
    }

    // 如果系统提示未被处理（例如，没有用户消息），则单独添加
    if (system && !systemPromptProcessed) {
      contents.unshift({ role: 'user', parts: [{ text: system }] });
    }

    return contents;
  }

  private extractTextFromContent(content: any): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.filter(c => c.type === 'text').map(c => c.text).join('');
    }
    return '';
  }

  /**
   * 将Claude工具转换为Gemini工具
   */
  private convertTools(tools?: any[]): any[] | undefined {
    if (!tools || tools.length === 0) {
      return undefined;
    }

    return [{
      functionDeclarations: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: this.cleanJsonSchema(tool.input_schema),
      })),
    }];
  }

  /**
   * 清理JSON Schema中Gemini API不支持的字段
   */
  private cleanJsonSchema(schema: any): any {
    if (!schema || typeof schema !== 'object') {
      return schema;
    }

    const cleaned = JSON.parse(JSON.stringify(schema));

    const cleanObject = (obj: any): any => {
      if (!obj || typeof obj !== 'object') {
        return obj;
      }

      if (Array.isArray(obj)) {
        return obj.map(cleanObject);
      }

      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (key === 'additionalProperties' || key === '$schema') {
          continue;
        }
        result[key] = cleanObject(value);
      }
      return result;
    };

    return cleanObject(cleaned);
  }

  /**
   * 转换工具选择配置
   */
  private convertToolChoice(tool_choice?: 'auto' | 'none' | { type: 'tool'; name: string }): any | undefined {
    if (!tool_choice) {
      return undefined;
    }

    let mode: 'AUTO' | 'ANY' | 'NONE' = 'AUTO';
    let allowedFunctionNames: string[] | undefined = undefined;

    if (typeof tool_choice === 'string') {
      if (tool_choice === 'auto') {
        mode = 'AUTO';
      } else if (tool_choice === 'none') {
        mode = 'NONE';
      }
    } else if (tool_choice.type === 'tool' && tool_choice.name) {
      mode = 'ANY';
      allowedFunctionNames = [tool_choice.name];
    }

    return {
      functionCallingConfig: {
        mode: mode,
        ...(allowedFunctionNames && { allowedFunctionNames: allowedFunctionNames }),
      },
    };
  }

  /**
   * 转换Gemini响应到Claude内容格式
   */
  private convertGeminiResponseToClaude(candidate: any, claudeThinkingEnabled: boolean): any[] {
    const { content } = candidate;
    const claudeContent: any[] = [];

    // 遍历所有parts，正确处理每种类型
    if (content?.parts && Array.isArray(content.parts)) {
      for (const part of content.parts) {
        // 处理thinking部分 - 仅当请求显式启用thinking时才返回
        if (claudeThinkingEnabled && part.text && part.thought === true) {
          claudeContent.push({ type: 'thinking', thinking: part.text });
        }
        
        // 处理普通文本部分 - 没有thought字段或thought为false的文本
        if (part.text && part.thought !== true) {
          claudeContent.push({ type: 'text', text: part.text });
        }
        
        // 处理工具调用部分
        if (part.functionCall) {
          const { name, args } = part.functionCall;
          claudeContent.push({
            type: 'tool_use',
            id: this.generateToolUseId(),
            name: name,
            input: args || {},
          });
        }
      }
    }

    // 如果没有任何内容，添加一个空文本块以符合Claude格式
    if (claudeContent.length === 0) {
      claudeContent.push({ type: 'text', text: '' });
    }

    return claudeContent;
  }

  /**
   * 映射停止原因
   */
  private mapStopReason(geminiReason?: string, claudeContent?: any[]): string {
    // 检查是否有工具调用
    const hasToolUse = claudeContent?.some(item => item.type === 'tool_use');
    
    if (hasToolUse) {
      return 'tool_use';
    }

    // 检查Gemini的finishReason
    switch (geminiReason) {
      case 'STOP': return 'end_turn';
      case 'MAX_TOKENS': return 'max_tokens';
      case 'TOOL_CALL': return 'tool_use';
      case 'SAFETY': return 'end_turn';
      case 'RECITATION': return 'end_turn';
      default: return 'end_turn';
    }
  }

  /**
   * 生成标准格式的tool_use ID
   */
  private generateToolUseId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 15);
    return `toolu_${timestamp}${random}`.substring(0, 24);
  }

  /**
   * 创建Claude流式转换器 (基于原版逻辑)
   */
  private createClaudeStreamTransformer(body: any, originalRequest: any): ReadableStream {
    // 使用现有的StreamingProcessor来处理流式转换
    const { StreamingProcessor } = require('../processors/streaming');
    return StreamingProcessor.createClaudeStreamTransformer(body, originalRequest);
  }
}