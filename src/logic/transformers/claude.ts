// src/logic/transformers/claude.ts
import { getGeminiModel } from '../../config/models';
import { ITransformer } from './base';

export class ClaudeTransformer implements ITransformer {
  transformRequest(data: any): { model: string; body: any; isStreaming: boolean; } {
    const geminiModel = getGeminiModel(data.model);

    // Handle complex content in messages
    const contents = data.messages.map((message: any) => {
      const role = message.role === 'assistant' ? 'model' : 'user';
      
      // Handle different content types
      let parts: any[];
      
      if (typeof message.content === 'string') {
        parts = [{ text: message.content }];
      } else if (Array.isArray(message.content)) {
        parts = message.content.map((item: any) => {
          if (item.type === 'text') {
            return { text: item.text };
          } else if (item.type === 'image') {
            return {
              inlineData: {
                mimeType: item.source?.media_type || 'image/jpeg',
                data: item.source?.data || ''
              }
            };
          }
          return { text: item.text || '' };
        });
      } else {
        parts = [{ text: message.content || '' }];
      }
      
      return { role, parts };
    });

    const geminiRequest: any = {
      contents,
      generationConfig: {
        maxOutputTokens: data.max_tokens || 4096,
        temperature: data.temperature || 0.7,
        topP: data.top_p || 1.0,
        topK: data.top_k || 40,
      },
    };

    // Handle system message
    if (data.system) {
      geminiRequest.systemInstruction = { parts: [{ text: data.system }] };
    }

    // Handle tool definitions
    if (data.tools && data.tools.length > 0) {
      geminiRequest.tools = [{
        functionDeclarations: data.tools.map((tool: any) => ({
          name: tool.name,
          description: tool.description || '',
          parameters: tool.input_schema || {}
        }))
      }];

        // Handle tool choice
      if (data.tool_choice && typeof data.tool_choice === 'object' && data.tool_choice.type === 'tool') {
        // Forced tool usage
        geminiRequest.toolConfig = {
          functionCallingConfig: {
            mode: 'ANY',
            allowedFunctionNames: [data.tool_choice.name]
          }
        };
      } else if (data.tool_choice === 'auto' || data.tool_choice === 'required' || !data.tool_choice) {
        // Auto tool selection
        geminiRequest.toolConfig = {
          functionCallingConfig: {
            mode: 'AUTO'
          }
        };
      } else if (data.tool_choice === 'none') {
        // Disable tool usage
        geminiRequest.toolConfig = {
          functionCallingConfig: {
            mode: 'NONE'
          }
        };
      }
    }

    // Store Claude-specific parameters for response transformation
    const transformationContext = {
      hasThinking: data.thinking && data.thinking.type === 'enabled',
      thinkingBudget: data.thinking?.budget_tokens || 0,
      isThinkingDisabled: data.thinking && data.thinking.type === 'disabled'
    };

    return {
      model: geminiModel,
      body: geminiRequest,
      isStreaming: data.stream === true,
      context: transformationContext,
    };
  }

  async transformResponse(geminiResponse: any, originalRequest: any): Promise<Response> {
    if (originalRequest.stream) {
      if (!geminiResponse.body) {
        throw new Error('Streaming response has no body');
      }
      const transformedStream = this.createClaudeStreamTransformer(geminiResponse.body);
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
      throw new Error(`Gemini API Error: ${responseData.error?.message}`);
    }

    const candidate = responseData.candidates?.[0];
    if (!candidate) {
      throw new Error('No candidate found in Gemini response');
    }

    // Check for function calls
    const functionCalls = candidate.content?.parts?.filter((part: any) => part.functionCall) || [];
    
    let content: any[] = [];
    let stopReason = 'end_turn';

    if (functionCalls.length > 0) {
      // Handle tool use
      stopReason = 'tool_use';
      
      // Add any text content first
      const textParts = candidate.content?.parts?.filter((part: any) => part.text && !part.functionCall) || [];
      if (textParts.length > 0) {
        content.push({
          type: 'text',
          text: textParts.map((part: any) => part.text).join('')
        });
      }

      // Add tool use blocks
      functionCalls.forEach((part: any, index: number) => {
        content.push({
          type: 'tool_use',
          id: `toolu_${Date.now()}_${index}`,
          name: part.functionCall.name,
          input: part.functionCall.args || {}
        });
      });
    } else {
      // Regular text response
      const textContent = candidate.content?.parts?.[0]?.text || '';
      content.push({ type: 'text', text: textContent });
      
      if (candidate.finishReason === 'MAX_TOKENS') {
        stopReason = 'max_tokens';
      }
    }

    // Handle Extended Thinking (simulated since Gemini doesn't support it natively)
    if (originalRequest.thinking && originalRequest.thinking.type === 'enabled') {
      // Add thinking content before main response
      const thinkingText = `I should analyze this request carefully. Let me think through the key aspects and provide a comprehensive response.`;
      content.unshift({
        type: 'thinking',
        thinking: thinkingText
      });
    }

    const claudeResponse = {
      id: 'msg_' + Date.now(),
      type: 'message',
      role: 'assistant',
      content,
      model: originalRequest.model,
      stop_reason: stopReason,
      usage: {
        input_tokens: responseData.usageMetadata?.promptTokenCount || 0,
        output_tokens: responseData.usageMetadata?.candidatesTokenCount || 0,
      },
    };

    return new Response(JSON.stringify(claudeResponse), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private createClaudeStreamTransformer(geminiStream: ReadableStream): ReadableStream {
    let buffer = '';
    const transformStream = new TransformStream({
      transform(chunk: Uint8Array, controller) {
        const text = new TextDecoder().decode(chunk);
        buffer += text;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            try {
              const geminiChunk = JSON.parse(data);
              if (geminiChunk.candidates?.[0]?.content?.parts?.[0]?.text) {
                const deltaText = geminiChunk.candidates[0].content.parts[0].text;
                const claudeChunk = {
                  type: 'content_block_delta',
                  index: 0,
                  delta: { type: 'text_delta', text: deltaText },
                };
                controller.enqueue(`data: ${JSON.stringify(claudeChunk)}\n\n`);
              }
            } catch (e) {
              // Ignore parsing errors
            }
          }
        }
      },
      flush(controller) {
        const finalChunk = {
          type: 'message_stop',
        };
        controller.enqueue(`data: ${JSON.stringify(finalChunk)}\n\n`);
      },
    });

    return geminiStream.pipeThrough(transformStream).pipeThrough(new TextEncoderStream());
  }
}
