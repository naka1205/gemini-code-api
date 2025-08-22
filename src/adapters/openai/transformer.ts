/**
 * OpenAI兼容适配器 - 转换器
 * 将OpenAI格式请求转换为Gemini格式，并将响应转换回OpenAI格式
 */
import { log } from '@/utils/logger.js';
import type { AdapterContext } from '@/adapters/base/adapter.js';
import { AdapterErrorHandler } from '@/adapters/base/errors.js';
import { MODEL_MAPPINGS } from '@/utils/constants.js';

/**
 * OpenAI消息格式
 */
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  name?: string;
  function_call?: any;
}

/**
 * OpenAI请求格式
 */
export interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  stop?: string | string[];
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  user?: string;
  functions?: any[];
  function_call?: any;
  tools?: any[];
  tool_choice?: any;
}

/**
 * OpenAI响应格式
 */
export interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
      function_call?: any;
      tool_calls?: any[];
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Gemini内容格式
 */
interface GeminiContent {
  role?: string;
  parts: Array<{ text?: string; [key: string]: any }>;
}

/**
 * OpenAI请求转换器
 */
export class OpenAITransformer {
  /**
   * 将OpenAI请求转换为Gemini格式
   */
  static transformRequest(openaiRequest: OpenAIChatRequest, context: AdapterContext): any {
    // 1. 映射模型名称
    const geminiModel = this.mapModelName(openaiRequest.model);
    
    // 2. 转换消息格式
    const contents = this.convertMessages(openaiRequest.messages);
    
    // 3. 转换生成配置
    const generationConfig = this.convertGenerationConfig(openaiRequest);
    
    // 4. 处理工具/函数调用（如果有）
    const tools = this.convertTools(openaiRequest.functions, openaiRequest.tools);
    
    const geminiRequest: any = {
      contents,
      generationConfig,
    };
    
    // 添加工具配置（如果有）
    if (tools && tools.length > 0) {
      geminiRequest.tools = tools;
    }
    
    // 添加安全设置
    geminiRequest.safetySettings = this.getDefaultSafetySettings();
    
    // 在上下文中存储原始模型名称用于响应
    context.context.set('originalModel', openaiRequest.model);
    context.context.set('geminiModel', geminiModel);
    
    return geminiRequest;
  }

  /**
   * 将Gemini响应转换为OpenAI格式
   */
  static transformResponse(geminiResponse: any, context: AdapterContext): OpenAIChatResponse {
    const originalModel = context.context.get('originalModel') || 'gpt-3.5-turbo';
    const requestId = context.requestId || this.generateId();

    // 验证Gemini响应结构
    if (!geminiResponse.candidates || geminiResponse.candidates.length === 0) {
      throw new Error('Invalid Gemini response: no candidates');
    }

    const candidate = geminiResponse.candidates[0];
    const content = candidate.content;

    if (!content || !content.parts || content.parts.length === 0) {
      throw new Error('Invalid Gemini response: no content parts');
    }

    // 提取文本内容
    const messageContent = content.parts
      .filter((part: any) => part.text)
      .map((part: any) => part.text)
      .join('');

    // 确定完成原因
    const finishReason = this.mapFinishReason(candidate.finishReason);

    // 构建OpenAI格式响应
    const openaiResponse: OpenAIChatResponse = {
      id: `chatcmpl-${requestId}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: originalModel,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: messageContent,
        },
        finish_reason: finishReason,
      }],
      usage: this.extractUsageInfo(geminiResponse),
    };

    // 处理函数调用（如果有）
    if (candidate.content.parts.some((part: any) => part.functionCall)) {
      const functionCall = candidate.content.parts.find((part: any) => part.functionCall)?.functionCall;
      if (functionCall) {
        openaiResponse.choices[0].message.function_call = {
          name: functionCall.name,
          arguments: JSON.stringify(functionCall.args || {}),
        };
      }
    }

    return openaiResponse;
  }

  /**
   * 转换流式响应
   */
  static transformStreamChunk(geminiChunk: any, context: AdapterContext): string {
    const originalModel = context.context.get('originalModel') || 'gpt-3.5-turbo';
    const requestId = context.requestId || this.generateId();

    try {
      const data = typeof geminiChunk === 'string' ? JSON.parse(geminiChunk) : geminiChunk;
      
      if (!data.candidates || data.candidates.length === 0) {
        return '';
      }

      const candidate = data.candidates[0];
      const delta: any = {};

      // 提取内容变化
      if (candidate.content && candidate.content.parts) {
        const textParts = candidate.content.parts.filter((part: any) => part.text);
        if (textParts.length > 0) {
          delta.content = textParts.map((part: any) => part.text).join('');
        }
      }

      // 检查是否完成
      const isFinished = candidate.finishReason && candidate.finishReason !== 'STOP';
      
      const streamChunk = {
        id: `chatcmpl-${requestId}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: originalModel,
        choices: [{
          index: 0,
          delta,
          finish_reason: isFinished ? this.mapFinishReason(candidate.finishReason) : null,
        }],
      };

      return `data: ${JSON.stringify(streamChunk)}\n\n`;
    } catch (error) {
      log.error('Error transforming stream chunk:', error as Error);
      return '';
    }
  }

  // === 私有辅助方法 ===

  /**
   * 映射模型名称
   */
  private static mapModelName(openaiModel: string): string {
    const geminiModel = MODEL_MAPPINGS[openaiModel as keyof typeof MODEL_MAPPINGS];
    
    if (!geminiModel) {
      AdapterErrorHandler.handleModelMappingError(openaiModel, 'openai');
    }
    
    return geminiModel;
  }

  /**
   * 转换消息格式
   */
  private static convertMessages(messages: OpenAIMessage[]): GeminiContent[] {
    const contents: GeminiContent[] = [];
    let systemPrompt = '';

    for (const message of messages) {
      switch (message.role) {
        case 'system':
          // 将系统消息合并到第一个用户消息中
          systemPrompt += (systemPrompt ? '\n\n' : '') + message.content;
          break;

        case 'user':
          let userContent = typeof message.content === 'string' ? message.content : '';
          
          // 如果有系统提示且这是第一个用户消息，将其添加
          if (systemPrompt && contents.length === 0) {
            userContent = `${systemPrompt}\n\n${userContent}`;
            systemPrompt = '';
          }

          contents.push({
            role: 'user',
            parts: [{ text: userContent }],
          });
          break;

        case 'assistant':
          contents.push({
            role: 'model',
            parts: [{ text: message.content as string }],
          });
          break;

        case 'function':
          // 函数返回结果处理
          contents.push({
            role: 'function',
            parts: [{
              functionResponse: {
                name: message.name,
                response: { content: message.content },
              },
            }],
          });
          break;
      }
    }

    return contents;
  }

  /**
   * 转换生成配置
   */
  private static convertGenerationConfig(request: OpenAIChatRequest): any {
    const config: any = {};

    if (request.temperature !== undefined) {
      config.temperature = request.temperature;
    }

    if (request.top_p !== undefined) {
      config.topP = request.top_p;
    }

    if (request.max_tokens !== undefined) {
      config.maxOutputTokens = request.max_tokens;
    }

    if (request.stop !== undefined) {
      config.stopSequences = Array.isArray(request.stop) ? request.stop : [request.stop];
    }

    return config;
  }

  /**
   * 转换工具/函数定义
   */
  private static convertTools(functions?: any[], tools?: any[]): any[] {
    const convertedTools: any[] = [];

    // 处理legacy functions参数
    if (functions && functions.length > 0) {
      for (const func of functions) {
        convertedTools.push({
          functionDeclarations: [{
            name: func.name,
            description: func.description,
            parameters: func.parameters,
          }],
        });
      }
    }

    // 处理新的tools参数
    if (tools && tools.length > 0) {
      for (const tool of tools) {
        if (tool.type === 'function') {
          convertedTools.push({
            functionDeclarations: [{
              name: tool.function.name,
              description: tool.function.description,
              parameters: tool.function.parameters,
            }],
          });
        }
      }
    }

    return convertedTools;
  }

  /**
   * 获取默认安全设置
   */
  private static getDefaultSafetySettings(): any[] {
    return [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ];
  }

  /**
   * 映射完成原因
   */
  private static mapFinishReason(geminiReason?: string): string {
    switch (geminiReason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
        return 'content_filter';
      case 'RECITATION':
        return 'content_filter';
      default:
        return 'stop';
    }
  }

  /**
   * 提取使用信息
   */
  private static extractUsageInfo(geminiResponse: any): any {
    if (geminiResponse.usageMetadata) {
      return {
        prompt_tokens: geminiResponse.usageMetadata.promptTokenCount || 0,
        completion_tokens: geminiResponse.usageMetadata.candidatesTokenCount || 0,
        total_tokens: geminiResponse.usageMetadata.totalTokenCount || 0,
      };
    }

    // 如果没有使用信息，返回默认值
    return {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };
  }

  /**
   * 生成请求ID
   */
  private static generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}