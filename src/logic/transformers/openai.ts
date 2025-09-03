// src/logic/transformers/openai.ts
import { getGeminiModel } from '../../config/models';
import { ITransformer } from './base';
import { ErrorTransformer } from './error';
import { Multimodal } from '../processors/multimodal';

export class OpenAITransformer implements ITransformer {
  transformRequest(data: any): { model: string; body: any; isStreaming: boolean; } {
    const geminiModel = getGeminiModel(data.model);

    const geminiRequest: any = {
      contents: data.messages
        .filter((message: any) => message.role !== 'system')
        .map((message: any) => {
          const role = message.role === 'assistant' ? 'model' : 'user';
          
          // Handle multimodal content
          let parts: any[];
          if (typeof message.content === 'string') {
            parts = [{ text: message.content }];
          } else if (Array.isArray(message.content)) {
            try {
              parts = Multimodal.processOpenAIContent(message.content);
            } catch (error: any) {
              // Fallback to text-only processing if image processing fails
              console.warn('Image processing failed, falling back to text-only:', error.message);
              parts = [{ text: message.content.map((item: any) => item.text || '').join('') }];
            }
          } else {
            parts = [{ text: message.content || '' }];
          }
          
          return { role, parts };
        }),
      generationConfig: {
        maxOutputTokens: data.max_tokens || 4096,
        temperature: data.temperature || 0.7,
        topP: data.top_p || 1.0,
        topK: data.top_k || 40,
      },
    };

    // Handle system message
    const systemMessage = data.messages.find((msg: any) => msg.role === 'system');
    if (systemMessage) {
      geminiRequest.systemInstruction = { parts: [{ text: systemMessage.content }] };
    }

    // Handle tool definitions
    if (data.tools && data.tools.length > 0) {
      geminiRequest.tools = [{
        functionDeclarations: data.tools.map((tool: any) => ({
          name: tool.function.name,
          description: tool.function.description || '',
          parameters: tool.function.parameters || {}
        }))
      }];

      // Handle tool choice
      if (typeof data.tool_choice === 'object' && data.tool_choice?.function?.name) {
        // Force a specific tool to be called
        geminiRequest.toolConfig = {
          functionCallingConfig: {
            mode: 'ANY',
            allowedFunctionNames: [data.tool_choice.function.name]
          }
        };
      } else if (data.tool_choice === 'required') {
        // Force any tool to be called
        geminiRequest.toolConfig = {
          functionCallingConfig: { mode: 'ANY' }
        };
      } else if (data.tool_choice === 'none') {
        // Disable tool calling
        geminiRequest.toolConfig = {
          functionCallingConfig: { mode: 'NONE' }
        };
      } else { // Includes 'auto' and undefined/null
        // Default to auto tool selection
        geminiRequest.toolConfig = {
          functionCallingConfig: { mode: 'AUTO' }
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
        const transformedStream = this.createOpenAIStreamTransformer(geminiResponse.body, originalRequest.model);
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
        return ErrorTransformer.createErrorResponse(geminiError, 'openai', originalRequest.model);
      }

      const candidate = responseData.candidates?.[0];
      if (!candidate) {
        const error = { code: 'NO_CANDIDATES', message: 'No candidate found in Gemini response' };
        return ErrorTransformer.createErrorResponse(error, 'openai', originalRequest.model);
      }

      // Extract text content (simplified for basic chat only)
      const textParts = candidate.content?.parts?.filter((part: any) => part.text) || [];
      const content = textParts.map((part: any) => part.text).join('') || '';
      
      let finishReason = 'stop';
      if (candidate.finishReason === 'MAX_TOKENS') {
        finishReason = 'length';
      } else if (candidate.finishReason === 'SAFETY') {
        finishReason = 'content_filter';
      }

      const message = {
        role: 'assistant',
        content: content,
      };

    const openaiResponse = {
      id: 'chatcmpl-' + Date.now(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: originalRequest.model,
      choices: [{
        index: 0,
        message,
        finish_reason: finishReason,
      }],
      usage: {
        prompt_tokens: responseData.usageMetadata?.promptTokenCount || 0,
        completion_tokens: responseData.usageMetadata?.candidatesTokenCount || 0,
        total_tokens: responseData.usageMetadata?.totalTokenCount || 0,
      },
    };

    return new Response(JSON.stringify(openaiResponse), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    const geminiError = { code: 'TRANSFORM_ERROR', message: error.message || 'Response transformation failed' };
    return ErrorTransformer.createErrorResponse(geminiError, 'openai', originalRequest.model);
  }
}

  // Based on the working code from bak/adapters/openai/chat.ts
  private createOpenAIStreamTransformer(geminiStream: ReadableStream, model: string): ReadableStream {
    const id = `chatcmpl-${Date.now()}`;
    let buffer = '';
    const MAX_BUFFER_SIZE = 1024 * 1024;

    const transformStream = new TransformStream({
      transform(chunk: Uint8Array, controller) {
        try {
          const text = new TextDecoder().decode(chunk);
          buffer += text;
          
          // Prevent buffer overflow
          if (buffer.length > MAX_BUFFER_SIZE) {
            buffer = buffer.substring(buffer.length - MAX_BUFFER_SIZE / 2);
          }
          
          // Process line by line (original working approach)
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.substring(6);
              
              if (data === '[DONE]') {
                const finalChunk = {
                  id,
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [{
                    index: 0,
                    delta: {},
                    finish_reason: 'stop',
                  }],
                };
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
                controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                return;
              }
              
              try {
                const parsed = JSON.parse(data);
                
                // Handle Gemini API errors
                if (parsed.error) {
                  const errorChunk = {
                    id,
                    object: 'chat.completion.chunk',
                    created: Math.floor(Date.now() / 1000),
                    model,
                    error: {
                      message: parsed.error.message || 'API request failed',
                      type: parsed.error.code === 403 ? 'invalid_api_key' : 'api_error',
                      code: parsed.error.code || null
                    }
                  };
                  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(errorChunk)}\n\n`));
                  controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                  return;
                }
                
                // Process candidates (original working logic)
                if (parsed.candidates && parsed.candidates.length > 0) {
                  const candidate = parsed.candidates[0];
                  
                  // Handle content parts
                  if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                    for (const part of candidate.content.parts) {
                      if (part.text && part.text.length > 0) {
                        const openaiChunk = {
                          id,
                          object: 'chat.completion.chunk',
                          created: Math.floor(Date.now() / 1000),
                          model,
                          choices: [{
                            index: 0,
                            delta: { content: part.text },
                            finish_reason: null,
                          }],
                        };
                        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(openaiChunk)}\n\n`));
                      }
                    }
                  }
                  
                  // Handle finish reason
                  if (candidate.finishReason) {
                    const finishReason = candidate.finishReason === 'MAX_TOKENS' ? 'length' : 
                                       candidate.finishReason === 'SAFETY' ? 'content_filter' : 'stop';
                    const finalChunk = {
                      id,
                      object: 'chat.completion.chunk',
                      created: Math.floor(Date.now() / 1000),
                      model,
                      choices: [{
                        index: 0,
                        delta: {},
                        finish_reason: finishReason,
                      }],
                    };
                    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
                    controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                    return;
                  }
                }
              } catch (parseError) {
                console.warn('Failed to parse Gemini streaming chunk in OpenAI transformer:', parseError);
              }
            }
          }
        } catch (error) {
          console.error('Error in OpenAI stream transform:', error);
        }
      },
      flush(controller) {
        try {
          const finalChunk = {
            id: id,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{
              index: 0,
              delta: {},
              finish_reason: 'stop',
            }],
          };
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        } catch (error) {
          console.error('Error in OpenAI stream flush:', error);
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        }
      },
    });

    return geminiStream.pipeThrough(transformStream);
  }
}