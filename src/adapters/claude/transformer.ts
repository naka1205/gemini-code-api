import type { AdapterContext } from '../base/adapter.js';
import { MODEL_MAPPINGS } from '../../utils/constants.js';

// 定义 Claude 原生请求体接口
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
  tool_choice?: { type: string; name?: string };
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
    
    // 2. 转换消息和系统提示
    const contents = this.convertMessages(claudeRequest.messages, claudeRequest.system);
    
    // 3. 转换生成配置
    const generationConfig = this.convertGenerationConfig(claudeRequest);

    // 4. 【新增】转换工具
    const geminiTools = this.convertTools(claudeRequest.tools);

    // 5. 【新增】转换工具选择
    const geminiToolConfig = this.convertToolChoice(claudeRequest.tool_choice);
    
    const geminiRequest: any = {
      contents,
      generationConfig,
    };

    if (geminiTools && geminiTools.length > 0) {
      geminiRequest.tools = geminiTools;
    }

    if (geminiToolConfig) {
      geminiRequest.tool_config = geminiToolConfig;
    }
    
    // 在上下文中存储原始模型名称用于响应
    context.context.set('originalModel', claudeRequest.model);
    context.context.set('geminiModel', geminiModel); // 保存 geminiModel
    
    return geminiRequest;
  }

  /**
   * 将 Gemini 响应转换为 Claude 格式
   */
  static transformResponse(geminiResponse: any, context: AdapterContext): any {
    const originalModel = context.context.get('originalModel') || 'claude-3-opus-20240229';
    const candidate = geminiResponse.candidates?.[0];

    if (!candidate) {
      throw new Error('Invalid Gemini response: no candidates');
    }

    const { content, finishReason } = candidate;
    const claudeContent: any[] = [];

    // 【新增】检查并转换thinking部分
    const thinkingPart = content?.parts?.find((part: any) => part.thinking);
    if (thinkingPart) {
      claudeContent.push({ type: 'thinking', thinking: thinkingPart.thinking });
    }

    // 检查并转换文本部分
    const textPart = content?.parts?.find((part: any) => part.text);
    if (textPart) {
      claudeContent.push({ type: 'text', text: textPart.text });
    }

    // 【新增】检查并转换工具调用部分
    const functionCallPart = content?.parts?.find((part: any) => part.functionCall);
    if (functionCallPart?.functionCall) {
      const { name, args } = functionCallPart.functionCall;
      claudeContent.push({
        type: 'tool_use',
        id: `toolu_${context.requestId || ''}_${Date.now()}`, // 生成一个唯一的 tool use ID
        name: name,
        input: args || {},
      });
    }

    // 如果没有任何内容，添加一个空文本块以符合Claude格式
    if (claudeContent.length === 0) {
      claudeContent.push({ type: 'text', text: '' });
    }

    return {
      id: `msg_${context.requestId}`,
      type: 'message',
      role: 'assistant',
      model: originalModel,
      content: claudeContent,
      stop_reason: this.mapStopReason(finishReason),
      usage: {
        input_tokens: geminiResponse.usageMetadata?.promptTokenCount || 0,
        output_tokens: geminiResponse.usageMetadata?.candidatesTokenCount || 0,
      },
    };
  }

  // --- 辅助方法 ---

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

  private static convertGenerationConfig(request: ClaudeRequest): any {
    const config: any = {};
    if (request.max_tokens !== undefined) config.maxOutputTokens = request.max_tokens;
    if (request.temperature !== undefined) config.temperature = request.temperature;
    if (request.top_p !== undefined) config.topP = request.top_p;
    if (request.top_k !== undefined) config.topK = request.top_k;
    if (request.stop_sequences !== undefined) config.stopSequences = request.stop_sequences;
    return config;
  }

  /**
   * 【新增】将 Claude 工具转换为 Gemini 工具
   */
  private static convertTools(tools?: any[]): any[] | undefined {
    if (!tools || tools.length === 0) {
      return undefined;
    }

    return [{
      functionDeclarations: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: this.cleanJsonSchema(tool.input_schema), // 清理不支持的字段
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
   * 【最终修正】将 Claude tool_choice 转换为 Gemini tool_config
   */
  private static convertToolChoice(tool_choice?: { type: string; name?: string }): any | undefined {
    if (!tool_choice) {
      return undefined;
    }

    let mode: 'AUTO' | 'ANY' | 'NONE' = 'AUTO';
    let allowedFunctionNames: string[] | undefined = undefined;

    if (tool_choice.type === 'any') {
      mode = 'ANY';
    } else if (tool_choice.type === 'auto') {
      mode = 'AUTO';
    } else if (tool_choice.type === 'tool' && tool_choice.name) {
      mode = 'ANY';
      allowedFunctionNames = [tool_choice.name];
    } else {
      return undefined;
    }

    return {
      functionCallingConfig: {
        mode: mode,
        ...(allowedFunctionNames && { allowedFunctionNames: allowedFunctionNames }),
      },
    };
  }

  private static mapStopReason(geminiReason?: string): string {
    switch (geminiReason) {
      case 'STOP': return 'end_turn';
      case 'MAX_TOKENS': return 'max_tokens';
      // Gemini 的 'TOOL_CALL' 应该映射到 Claude 的 'tool_use'
      case 'TOOL_CALL': return 'tool_use'; 
      default: return 'end_turn';
    }
  }
}