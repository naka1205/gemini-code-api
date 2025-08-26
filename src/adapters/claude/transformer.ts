import type { AdapterContext } from '../base/adapter.js';
import { MODEL_MAPPINGS, isThinkingSupportedModel } from '../../utils/constants.js';

// 定义 Claude 原生请求体接口 - 基于官方文档
export interface ClaudeRequest {
  model: string;
  messages: { role: 'user' | 'assistant'; content: any }[];
  system?: string;
  max_tokens: number;
  stop_sequences?: string[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  tools?: any[];
  tool_choice?: 'auto' | 'none' | { type: 'tool'; name: string };
  thinking?: { type: 'enabled'; budget_tokens?: number };
}

/**
 * Claude 请求转换器 (Claude -> Gemini)
 */
export class ClaudeTransformer {
  /**
   * 将 Claude 请求转换为 Gemini 格式
   */
  static transformRequest(claudeRequest: ClaudeRequest, context: AdapterContext): any {
    // 1. 映射模型名称
    const geminiModel = MODEL_MAPPINGS[claudeRequest.model as keyof typeof MODEL_MAPPINGS] || claudeRequest.model;
    const supportsThinking = isThinkingSupportedModel(geminiModel);
    
    // 2. 转换消息和系统提示
    const contents = this.convertMessages(claudeRequest.messages, claudeRequest.system);
    
    // 3. 转换生成配置
    // 3. 转换生成配置（设置稳健默认值）
    const requestedMax = Math.max(0, Number(claudeRequest.max_tokens || 0));
    const defaultMax = 1024; // 合理默认，避免频繁触顶
    const maxOutputTokens = requestedMax > 0 ? requestedMax : defaultMax;
    const generationConfig: any = {
      maxOutputTokens,
    };

    // 处理 Extended Thinking 参数（仅 2.5 支持）：
    const claudeThinkingEnabled = claudeRequest.thinking?.type === "enabled";
    if (supportsThinking) {
      if (claudeThinkingEnabled) {
        const rawBudget = claudeRequest.thinking?.budget_tokens ?? 8192;
        // 限制思考预算为输出上限的 33%，且不小于 256
        const capByMax = Math.floor(maxOutputTokens * 0.33);
        const thinkingBudget = Math.max(256, Math.min(rawBudget, Math.max(256, capByMax)));
        generationConfig.thinkingConfig = {
          includeThoughts: true,
          thinkingBudget
        };
      } else {
        // Claude 默认禁用思考：在支持思考的模型上显式禁用
        generationConfig.thinkingConfig = {
          includeThoughts: false
        };
      }
    } else {
      // 非 2.5 模型：不注入任何 thinkingConfig，避免报错
      if (generationConfig.thinkingConfig) delete generationConfig.thinkingConfig;
    }

    // 处理其他参数（归一化与裁剪）
    const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max);

    if (claudeRequest.temperature !== undefined) {
      const t = Number(claudeRequest.temperature);
      if (!Number.isNaN(t)) generationConfig.temperature = clamp(t, 0, 2);
    }

    if (claudeRequest.top_p !== undefined) {
      const p = Number(claudeRequest.top_p);
      if (!Number.isNaN(p)) generationConfig.topP = clamp(p, 0, 1);
    }

    if (claudeRequest.top_k !== undefined) {
      const k = Math.floor(Number(claudeRequest.top_k));
      if (!Number.isNaN(k)) generationConfig.topK = clamp(k, 1, 1000);
    }

    if (claudeRequest.stop_sequences && Array.isArray(claudeRequest.stop_sequences)) {
      const cleaned = claudeRequest.stop_sequences
        .filter((s) => typeof s === 'string' && s.length > 0)
        .slice(0, 8) // 限制上限，避免过多停止序列
        .map((s) => s.slice(0, 120)); // 过长截断
      if (cleaned.length > 0) generationConfig.stopSequences = cleaned;
    }

    // 4. 转换工具 - 基于官方文档格式
    const geminiTools = this.convertTools(claudeRequest.tools);

    // 5. 转换工具选择 - 基于官方文档格式
    const geminiToolConfig = this.convertToolChoice(claudeRequest.tool_choice);
    
    const geminiRequest: any = {
      contents,
      generationConfig,
    };

    if (geminiTools && geminiTools.length > 0) {
      geminiRequest.tools = geminiTools;
    }

    if (geminiToolConfig) {
      geminiRequest.toolConfig = geminiToolConfig;
    }
    
    // 在上下文中存储原始模型名称用于响应
    context.context.set('originalModel', claudeRequest.model);
    context.context.set('geminiModel', geminiModel);
    context.context.set('claudeThinkingEnabled', claudeThinkingEnabled === true);
    
    return geminiRequest;
  }

  /**
   * 将 Gemini 响应转换为 Claude 格式 - 基于官方文档
   */
  static transformResponse(geminiResponse: any, context: AdapterContext): any {
    const originalModel = context.context.get('originalModel') || 'claude-3-opus-20240229';
    const claudeThinkingEnabled = context.context.get('claudeThinkingEnabled') === true;
    const candidate = geminiResponse.candidates?.[0];

    if (!candidate) {
      throw new Error('Invalid Gemini response: no candidates');
    }

    const { content, finishReason } = candidate;
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
        
        // 处理工具调用部分 - 基于官方文档格式
        if (part.functionCall) {
          const { name, args } = part.functionCall;
          claudeContent.push({
            type: 'tool_use',
            id: this.generateToolUseId(), // 生成标准格式的ID
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

    // 确定stop_reason - 基于官方文档
    const stopReason = this.mapStopReason(finishReason, claudeContent);

    return {
      id: `msg_${context.requestId || this.generateMessageId()}`,
      type: 'message',
      role: 'assistant',
      model: originalModel,
      content: claudeContent,
      stop_reason: stopReason,
      stop_sequence: null, // Claude API 要求
      usage: {
        input_tokens: geminiResponse.usageMetadata?.promptTokenCount || 0,
        output_tokens: geminiResponse.usageMetadata?.candidatesTokenCount || 0,
      },
    };
  }

  // --- 辅助方法 ---

  /**
   * 生成标准格式的tool_use ID
   */
  private static generateToolUseId(): string {
    // 生成类似 "toolu_01A09q90qw90lq917835lq9" 的格式
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 15);
    return `toolu_${timestamp}${random}`.substring(0, 24);
  }

  /**
   * 生成标准格式的message ID
   */
  private static generateMessageId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 15);
    return `${timestamp}${random}`.substring(0, 20);
  }

  private static convertMessages(messages: { role: 'user' | 'assistant'; content: any }[], system?: string): any[] {
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

  private static extractTextFromContent(content: any): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.filter(c => c.type === 'text').map(c => c.text).join('');
    }
    return '';
  }

  /**
   * 将 Claude 工具转换为 Gemini 工具 - 基于官方文档格式
   */
  private static convertTools(tools?: any[]): any[] | undefined {
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
   * 清理 JSON Schema 中 Gemini API 不支持的字段
   */
  private static cleanJsonSchema(schema: any): any {
    if (!schema || typeof schema !== 'object') {
      return schema;
    }

    // 创建副本以避免修改原始对象
    const cleaned = JSON.parse(JSON.stringify(schema));

    // 递归清理函数
    const cleanObject = (obj: any): any => {
      if (!obj || typeof obj !== 'object') {
        return obj;
      }

      if (Array.isArray(obj)) {
        return obj.map(cleanObject);
      }

      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // 跳过 Gemini API 不支持的字段
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
   * 将 Claude tool_choice 转换为 Gemini tool_config - 基于官方文档
   */
  private static convertToolChoice(tool_choice?: 'auto' | 'none' | { type: 'tool'; name: string }): any | undefined {
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
   * 映射停止原因 - 基于官方文档
   */
  private static mapStopReason(geminiReason?: string, claudeContent?: any[]): string {
    // 检查是否有工具调用
    const hasToolUse = claudeContent?.some(item => item.type === 'tool_use');
    
    if (hasToolUse) {
      return 'tool_use'; // Claude API 官方文档中的标准值
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
}