// src/logic/transformers/claude.ts
import { ITransformer } from './base';
import { ClaudeProcessor } from '../processors/claude';
import { ToolsProcessor } from '../processors/tools';
import { ThinkingProcessor } from '../processors/thinking';
import { ConfigProcessor } from '../processors/config';
import { StreamingProcessor } from '../processors/streaming';
import { ErrorTransformer } from './error';
import { getGeminiModel } from '../../config/models';

/**
 * Claude数据转换器
 * 只负责数据结构转换，不处理业务逻辑
 * 遵循"只做数据结构转换，不处理对话内容"的原则
 */
export class ClaudeTransformer implements ITransformer {
  
  /**
   * 将Claude请求转换为Gemini格式
   * 纯数据结构转换，不处理内容
   */
  transformRequest(data: any): { model: string; body: any; isStreaming: boolean; } {
    const geminiModel = getGeminiModel(data.model);

    // 使用ClaudeProcessor进行消息转换
    const contents = ClaudeProcessor.convertMessages(data.messages, data.system);

    // 使用ConfigProcessor创建生成配置
    const defaultConfig = ConfigProcessor.createDefaultGenerationConfig();
    const generationConfig = ConfigProcessor.mergeGenerationConfig(data, defaultConfig);

    const geminiRequest: any = {
      contents,
      generationConfig,
    };

    // 使用ThinkingProcessor处理思考配置
    // 只有支持推理的模型才添加thinkingConfig
    if (ThinkingProcessor.isThinkingSupported(geminiModel)) {
      const thinkingConfig = ThinkingProcessor.convertThinkingConfig(
        data.thinking, 
        data.max_tokens, 
        true
      );
      if (thinkingConfig) {
        geminiRequest.generationConfig.thinkingConfig = thinkingConfig;
      }
    } else if (data.thinking) {
      // 对于不支持推理的模型，如果用户指定了thinking配置，记录警告但不添加
      console.warn(`Model ${geminiModel} does not support thinking, ignoring thinking configuration`);
    }

    // 使用ToolsProcessor处理工具配置
    if (data.tools && data.tools.length > 0) {
      const tools = ToolsProcessor.convertTools(data.tools);
      if (tools) {
        geminiRequest.tools = tools;
      }

      const toolConfig = ToolsProcessor.convertToolChoice(data.tool_choice);
      if (toolConfig) {
        geminiRequest.toolConfig = toolConfig;
      }
    }

    return {
      model: geminiModel,
      body: geminiRequest,
      isStreaming: data.stream === true,
    };
  }

  /**
   * 将Gemini响应转换为Claude格式
   * 纯数据结构转换，不处理内容
   */
  async transformResponse(geminiResponse: any, originalRequest: any): Promise<Response> {
    try {
      if (originalRequest.stream) {
        if (!geminiResponse.body) {
          throw new Error('Streaming response has no body');
        }
        
        // 使用StreamingProcessor处理流式转换
        const transformedStream = StreamingProcessor.createClaudeStreamTransformer(
          geminiResponse.body, 
          originalRequest
        );
        
        // 按照BAK原版逻辑设置流式响应头
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
      if (!geminiResponse.ok) {
        const geminiError = ErrorTransformer.parseGeminiError({ error: responseData.error });
        return ErrorTransformer.createErrorResponse(geminiError, 'claude');
      }

      const candidate = responseData.candidates?.[0];
      if (!candidate) {
        const error = { code: 'NO_CANDIDATES', message: 'No candidate found in Gemini response' };
        return ErrorTransformer.createErrorResponse(error, 'claude');
      }

      // 使用ClaudeProcessor进行响应转换
      const claudeContent = ClaudeProcessor.convertGeminiResponseToClaude(
        candidate, 
        originalRequest.thinking?.type === 'enabled'
      );
      
      const stopReason = ClaudeProcessor.mapStopReason(candidate.finishReason, claudeContent);

      const claudeResponse = {
        id: 'msg_' + Date.now(),
        type: 'message',
        role: 'assistant',
        content: claudeContent,
        model: originalRequest.model,
        stop_reason: stopReason,
        usage: {
          input_tokens: responseData.usageMetadata?.promptTokenCount || 0,
          output_tokens: responseData.usageMetadata?.candidatesTokenCount || 0,
        },
      };

      // 按照BAK原版逻辑设置非流式响应头
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
}