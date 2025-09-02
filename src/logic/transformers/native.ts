// src/logic/transformers/native.ts
import { ITransformer } from './base';

/**
 * A pass-through transformer for native Gemini requests.
 * It performs minimal transformation while preserving the native Gemini format.
 */
export class NativeTransformer implements ITransformer {
  transformRequest(data: any): { model: string; body: any; isStreaming: boolean; } {
    // Remove stream and model from the body since they are not part of Gemini API request format
    const { stream, model, ...cleanBody } = data;
    
    return {
      model: data.model || 'gemini-2.5-flash', // Use the actual model from request
      body: cleanBody, // Clean body without stream/model fields  
      isStreaming: data.stream === true,
    };
  }

  async transformResponse(geminiResponse: any, originalRequest: any): Promise<Response> {
    // For streaming responses, we need to handle them specially
    if (originalRequest.stream && geminiResponse instanceof Response) {
      console.log('Streaming response detected:', {
        status: geminiResponse.status,
        contentType: geminiResponse.headers.get('content-type'),
        hasBody: !!geminiResponse.body,
        contentLength: geminiResponse.headers.get('content-length')
      });
      
      // For streaming, just pass through the response with correct headers
      if (geminiResponse.body) {
        return new Response(geminiResponse.body, {
          status: geminiResponse.status,
          statusText: geminiResponse.statusText,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        });
      }
    }
    
    // For non-streaming responses, pass through the response
    if (geminiResponse instanceof Response) {
      return geminiResponse;
    }
    
    // If it's raw data, convert to JSON response
    return new Response(JSON.stringify(geminiResponse), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
