// src/logic/processors/claude.ts

/**
 * Claude处理器 - 专门处理Claude相关的数据结构转换
 * 遵循"只做数据结构转换，不处理对话内容"的原则
 */

import { ThinkingProcessor, ThinkingConfig } from './thinking';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: any;
}

export class ClaudeProcessor {
  /**
   * 将Claude消息转换为Gemini格式
   * 只做数据结构转换，不处理内容
   */
  static convertMessages(messages: ClaudeMessage[], system?: string): any[] {
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

  /**
   * 从Claude内容中提取文本
   * 只提取，不生成内容
   */
  static extractTextFromContent(content: any): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.filter(c => c.type === 'text').map(c => c.text).join('');
    }
    return '';
  }

  /**
   * 转换Claude思考配置为Gemini格式
   * 只做配置转换，不处理内容
   */
  static convertThinkingConfig(
    thinking?: ThinkingConfig, 
    maxTokens?: number, 
    supportsThinking: boolean = false
  ): any | undefined {
    return ThinkingProcessor.convertThinkingConfig(thinking, maxTokens, supportsThinking);
  }

  /**
   * 将Gemini响应转换为Claude格式
   * 只做结构转换，不生成内容
   */
  static convertGeminiResponseToClaude(candidate: any, thinkingEnabled: boolean = false): any[] {
    const claudeContent: any[] = [];

    // 遍历所有parts，正确处理每种类型
    if (candidate.content?.parts && Array.isArray(candidate.content.parts)) {
      for (const part of candidate.content.parts) {
        // 处理thinking部分 - 仅当请求显式启用thinking时才返回
        if (thinkingEnabled && part.text && part.thought === true) {
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

    return claudeContent;
  }

  /**
   * 映射停止原因
   * 只做映射，不生成内容
   */
  static mapStopReason(geminiReason?: string, claudeContent?: any[]): string {
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

  /**
   * 生成标准格式的tool_use ID
   * 只生成ID，不生成内容
   */
  static generateToolUseId(): string {
    // 生成类似 "toolu_01A09q90qw90lq917835lq9" 的格式
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 15);
    return `toolu_${timestamp}${random}`.substring(0, 24);
  }

  /**
   * 验证Claude请求参数
   * 只做验证，不修改内容
   */
  static validateClaudeRequest(data: any): void {
    if (!data.model) {
      throw new Error('Field "model" is required');
    }
    if (!data.messages || !Array.isArray(data.messages)) {
      throw new Error('Field "messages" is required and must be an array');
    }
    if (data.messages.length === 0) {
      throw new Error('Field "messages" must not be empty');
    }

    // 验证消息格式
    data.messages.forEach((message: any, index: number) => {
      if (!message.role || !['user', 'assistant'].includes(message.role)) {
        throw new Error(`Invalid role at messages[${index}]. Must be "user" or "assistant"`);
      }
      if (message.content === undefined || message.content === null) {
        throw new Error(`Field "content" is required at messages[${index}]`);
      }
    });

    // 使用ThinkingProcessor验证思考配置
    ThinkingProcessor.validateThinkingConfig(data.thinking);

    // 验证流式参数
    if (data.stream !== undefined && typeof data.stream !== 'boolean') {
      throw new Error('Field "stream" must be a boolean');
    }
  }
}
