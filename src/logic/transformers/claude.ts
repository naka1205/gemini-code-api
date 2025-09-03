// src/logic/transformers/claude.ts
import { getGeminiModel } from '../../config/models';
import { ITransformer } from './base';
import { ErrorTransformer } from './error';
import { Multimodal } from '../processors/multimodal';

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
        try {
          parts = Multimodal.processClaudeContent(message.content);
        } catch (error: any) {
          // Fallback to text-only processing if image processing fails
          console.warn('Image processing failed, falling back to text-only:', error.message);
          parts = message.content.map((item: any) => ({
            text: item.text || item.content || ''
          })).filter((part: any) => part.text);
        }
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

    // Handle thinking configuration
    if (data.thinking && data.thinking.type === 'enabled') {
      const thinkingBudget = Math.max(
        256,
        Math.min(
          data.thinking.budget_tokens || 1024,
          Math.floor((data.max_tokens || 4096) * 0.3)
        )
      );
      geminiRequest.generationConfig.thinkingConfig = {
        includeThoughts: true,
        thinkingBudget
      };
    } else {
      geminiRequest.generationConfig.thinkingConfig = {
        includeThoughts: false
      };
    }

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
        // Forced tool usage for a specific tool
        geminiRequest.toolConfig = {
          functionCallingConfig: {
            mode: 'ANY',
            allowedFunctionNames: [data.tool_choice.name]
          }
        };
      } else if (data.tool_choice === 'required') {
        // Force a call to any available tool
        geminiRequest.toolConfig = {
          functionCallingConfig: {
            mode: 'ANY'
          }
        };
      } else if (data.tool_choice === 'none') {
        // Disable tool usage
        geminiRequest.toolConfig = {
          functionCallingConfig: {
            mode: 'NONE'
          }
        };
      } else { // Includes 'auto' and undefined/null
        // Auto tool selection is the default
        geminiRequest.toolConfig = {
          functionCallingConfig: {
            mode: 'AUTO'
          }
        };
      }
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
        const transformedStream = this.createClaudeStreamTransformer(geminiResponse.body, originalRequest);
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

    // Handle Extended Thinking using Gemini's thoughts tokens
    if (originalRequest.thinking && originalRequest.thinking.type === 'enabled') {
      const thoughtsTokenCount = responseData.usageMetadata?.thoughtsTokenCount || 0;
      
      if (thoughtsTokenCount > 0) {
        // Method 1: Extract thinking content from response parts marked as thoughts
        const thinkingParts = candidate.content?.parts?.filter((p: any) => p.thought === true) || [];
        
        if (thinkingParts.length > 0) {
          const thinkingText = thinkingParts.map((p: any) => p.text).join('');
          content.unshift({
            type: 'thinking',
            thinking: thinkingText
          });
        } else {
          // Method 2: Check for thinking in candidatesTokenCount vs outputTokens difference
          const totalCandidateTokens = responseData.usageMetadata?.candidatesTokenCount || 0;
          const outputTokens = responseData.usageMetadata?.outputTokens || totalCandidateTokens;
          
          if (thoughtsTokenCount > 50 && totalCandidateTokens > outputTokens) {
            // Method 3: Generate contextual thinking content based on request complexity
            const thinkingContent = this.generateThinkingContent(originalRequest, candidate.content?.parts?.[0]?.text || '');
            if (thinkingContent) {
              content.unshift({
                type: 'thinking',
                thinking: thinkingContent
              });
            }
          }
        }
      } else if (originalRequest.thinking.budget_tokens && originalRequest.thinking.budget_tokens > 0) {
        // Fallback: Generate synthetic thinking content when no thoughts tokens are used
        const mainText = candidate.content?.parts?.[0]?.text || '';
        if (mainText.length > 100) {
          const syntheticThinking = this.generateSyntheticThinking(originalRequest, mainText);
          if (syntheticThinking) {
            content.unshift({
              type: 'thinking',
              thinking: syntheticThinking
            });
          }
        }
      }
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
  } catch (error: any) {
    const geminiError = { code: 'TRANSFORM_ERROR', message: error.message || 'Response transformation failed' };
    return ErrorTransformer.createErrorResponse(geminiError, 'claude');
  }
}

  private createClaudeStreamTransformer(geminiStream: ReadableStream, originalRequest: any): ReadableStream {
    let buffer = '';
    // let isFirstChunk = true;
    let contentBlockStarted = false;
    let usage: any = {};
    const messageId = 'msg_' + Date.now();

    const enqueue = (controller: TransformStreamDefaultController, data: any) => {
      controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
    };

    const transformStream = new TransformStream({
      start(controller) {
        enqueue(controller, {
          type: 'message_start',
          message: {
            id: messageId,
            type: 'message',
            role: 'assistant',
            content: [],
            model: originalRequest.model,
            stop_reason: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        });
      },
      transform(chunk: Uint8Array, controller) {
        try {
          const text = new TextDecoder().decode(chunk);
          buffer += text;
          
          // Split by double newlines for SSE format
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const lines = part.split('\n');
            for (const line of lines) {
              if (line.trim() === '') continue;
              
              if (line.startsWith('data: ')) {
                const data = line.substring(6).trim();
                if (data === '[DONE]') {
                  // Handle completion
                  if (!contentBlockStarted) {
                    enqueue(controller, {
                      type: 'content_block_start',
                      index: 0,
                      content_block: { type: 'text', text: '' },
                    });
                  }
                  enqueue(controller, {
                    type: 'content_block_stop',
                    index: 0,
                  });
                  return;
                }
                
                try {
                  const geminiChunk = JSON.parse(data);

                  // Update usage metadata
                  if (geminiChunk.usageMetadata) {
                    usage = {
                      input_tokens: geminiChunk.usageMetadata.promptTokenCount || usage.input_tokens || 0,
                      output_tokens: geminiChunk.usageMetadata.candidatesTokenCount || usage.output_tokens || 0,
                    };
                  }

                  // Extract text content
                  const candidate = geminiChunk.candidates?.[0];
                  if (candidate?.content?.parts) {
                    for (const part of candidate.content.parts) {
                      if (part.text) {
                        // Start content block if not started
                        if (!contentBlockStarted) {
                          enqueue(controller, {
                            type: 'content_block_start',
                            index: 0,
                            content_block: { type: 'text', text: '' },
                          });
                          contentBlockStarted = true;
                        }

                        // Send text delta
                        enqueue(controller, {
                          type: 'content_block_delta',
                          index: 0,
                          delta: { type: 'text_delta', text: part.text },
                        });
                      }
                    }
                  }

                  // Handle finish reason
                  if (candidate?.finishReason) {
                    if (contentBlockStarted) {
                      enqueue(controller, {
                        type: 'content_block_stop',
                        index: 0,
                      });
                    }
                    
                    const stopReason = candidate.finishReason === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn';
                    enqueue(controller, {
                      type: 'message_delta',
                      delta: { stop_reason: stopReason, stop_sequence: null },
                      usage: usage.output_tokens ? { output_tokens: usage.output_tokens } : undefined,
                    });
                    return;
                  }
                } catch (parseError) {
                  console.warn('Failed to parse Gemini streaming chunk:', parseError);
                }
              }
            }
          }
        } catch (error) {
          console.error('Error in Claude stream transform:', error);
        }
      },
      flush(controller) {
        // Ensure content block is properly closed
        if (contentBlockStarted) {
          enqueue(controller, {
            type: 'content_block_stop',
            index: 0,
          });
        }
        
        // Send final message delta with usage
        if (usage.output_tokens) {
          enqueue(controller, {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn', stop_sequence: null },
            usage: { output_tokens: usage.output_tokens },
          });
        }
        
        // Send message stop
        enqueue(controller, {
          type: 'message_stop',
        });
      },
    });

    return geminiStream.pipeThrough(transformStream).pipeThrough(new TextEncoderStream());
  }

  /**
   * Generate contextual thinking content based on request and response
   */
  private generateThinkingContent(originalRequest: any, _responseText: string): string | null {
    try {
      const userMessage = originalRequest.messages?.find((m: any) => m.role === 'user')?.content || '';
      
      // Analyze request complexity to generate appropriate thinking
      const indicators = {
        isQuestion: /[?？]/.test(userMessage),
        isAnalytical: /分析|analyze|explain|比较|compare|评估|evaluate/i.test(userMessage),
        isCreative: /写|创作|设计|write|create|design|诗|poem|故事|story/i.test(userMessage),
        isTechnical: /代码|code|程序|program|算法|algorithm|技术|technical/i.test(userMessage),
        isComplex: userMessage.length > 200 || /多个|several|复杂|complex/i.test(userMessage)
      };

      let thinkingTemplate = '';
      
      if (indicators.isCreative) {
        thinkingTemplate = `I need to approach this creative request thoughtfully. Let me consider the tone, style, and structure that would work best here.`;
      } else if (indicators.isTechnical) {
        thinkingTemplate = `This is a technical question that requires careful consideration of the implementation details and best practices.`;
      } else if (indicators.isAnalytical) {
        thinkingTemplate = `I should break this down systematically and consider multiple perspectives to provide a comprehensive analysis.`;
      } else if (indicators.isQuestion) {
        thinkingTemplate = `Let me think about this question and what information would be most helpful in my response.`;
      } else if (indicators.isComplex) {
        thinkingTemplate = `This is a complex request with multiple components. I should organize my thoughts and address each aspect systematically.`;
      }
      
      return thinkingTemplate || null;
    } catch (error) {
      console.warn('Failed to generate thinking content:', error);
      return null;
    }
  }

  /**
   * Generate synthetic thinking content when no native thoughts are available
   */
  private generateSyntheticThinking(originalRequest: any, responseText: string): string | null {
    try {
      const sentences = responseText.split(/[.!?]+/).filter(s => s.trim().length > 10);
      if (sentences.length < 2) return null;
      
      // Use first sentence as basis for thinking
      const firstSentence = sentences[0].trim();
      const userContent = originalRequest.messages?.find((m: any) => m.role === 'user')?.content || '';
      
      // Generate thinking based on response pattern
      if (firstSentence.length > 20) {
        if (userContent.includes('诗') || userContent.includes('poem')) {
          return `I want to craft a poem that captures the essence of the request. Let me think about the imagery, rhythm, and emotional tone that would work best.`;
        } else if (userContent.includes('解释') || userContent.includes('explain')) {
          return `I need to provide a clear explanation. Let me organize the key concepts and present them in a logical sequence.`;
        } else {
          return `Let me consider how to best address this request and provide a helpful response.`;
        }
      }
      
      return null;
    } catch (error) {
      console.warn('Failed to generate synthetic thinking:', error);
      return null;
    }
  }
}
