// src/logic/transformers/openai.ts
import { getGeminiModel } from '../../config/models';
import { ITransformer } from './base';

export class OpenAITransformer implements ITransformer {
  transformRequest(data: any): { model: string; body: any; isStreaming: boolean; } {
    const geminiModel = getGeminiModel(data.model);

    const geminiRequest: any = {
      contents: data.messages
        .filter((message: any) => message.role !== 'system')
        .map((message: any) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content || '' }],
        })),
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
      if (data.tool_choice === 'none') {
        geminiRequest.toolConfig = {
          functionCallingConfig: { mode: 'NONE' }
        };
      } else if (data.tool_choice === 'required' || data.tool_choice === 'auto') {
        geminiRequest.toolConfig = {
          functionCallingConfig: { mode: 'AUTO' }
        };
      } else if (typeof data.tool_choice === 'object' && data.tool_choice?.function?.name) {
        geminiRequest.toolConfig = {
          functionCallingConfig: {
            mode: 'ANY',
            allowedFunctionNames: [data.tool_choice.function.name]
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
      throw new Error(`Gemini API Error: ${responseData.error?.message}`);
    }

    const candidate = responseData.candidates?.[0];
    if (!candidate) {
      throw new Error('No candidate found in Gemini response');
    }

    // Check for function calls
    const functionCalls = candidate.content?.parts?.filter((part: any) => part.functionCall) || [];
    
    let message: any = {
      role: 'assistant',
      content: null,
    };

    let finishReason = 'stop';

    if (functionCalls.length > 0) {
      // Handle tool calls
      finishReason = 'tool_calls';
      
      // Add any text content
      const textParts = candidate.content?.parts?.filter((part: any) => part.text && !part.functionCall) || [];
      if (textParts.length > 0) {
        message.content = textParts.map((part: any) => part.text).join('');
      }

      // Add tool calls
      message.tool_calls = functionCalls.map((part: any, index: number) => ({
        id: `call_${Date.now()}_${index}`,
        type: 'function',
        function: {
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args || {})
        }
      }));
    } else {
      // Regular text response
      message.content = candidate.content?.parts?.[0]?.text || '';
      
      if (candidate.finishReason === 'MAX_TOKENS') {
        finishReason = 'length';
      }
    }

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
  }

  private createOpenAIStreamTransformer(geminiStream: ReadableStream, model: string): ReadableStream {
    const id = `chatcmpl-${Date.now()}`;
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
                const openaiChunk = {
                  id,
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [{
                    index: 0,
                    delta: { content: geminiChunk.candidates[0].content.parts[0].text },
                    finish_reason: geminiChunk.candidates[0].finishReason === 'STOP' ? 'stop' : null,
                  }],
                };
                controller.enqueue(`data: ${JSON.stringify(openaiChunk)}\n\n`);
              }
            } catch (e) {}
          }
        }
      },
      flush(controller) {
        controller.enqueue('data: [DONE]\n\n');
      },
    });

    return geminiStream.pipeThrough(transformStream).pipeThrough(new TextEncoderStream());
  }
}