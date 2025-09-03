
// src/logic/adapters/base.adapter.ts
import { HttpClient } from '../../base/http/client';
import { BalancerService } from '../services/balancer';
import { EnhancedCacheService } from '../services/cache';
import { DbStorage } from '../../base/storage/db';
import { hashApiKey } from '../../common/utils';
import { ITransformer } from '../transformers/base';

export abstract class BaseAdapter {
  protected dbStorage: DbStorage;
  protected transformer: ITransformer;

  constructor(
    protected httpClient: HttpClient,
    protected balancer: BalancerService,
    protected cache: EnhancedCacheService,
    dbStorage: DbStorage,
    transformer: ITransformer,
  ) {
    this.dbStorage = dbStorage;
    this.transformer = transformer;
  }
  
  async process(c: any, apiKeys: string[]): Promise<Response> {
    try {
      const request = c.req.raw;
      const validatedData = await this.validate(request);
      const transformedRequest = this.transformer.transformRequest(validatedData);
      
      const apiKey = await this.balancer.selectOptimalKey(
        apiKeys,
        transformedRequest.model
      );

      const geminiResponse = await this.callApi(
        transformedRequest,
        apiKey
      );
      
      const response = await this.transformer.transformResponse(geminiResponse, validatedData);

      // Asynchronously record usage (check if executionCtx exists)
      if (c.executionCtx && c.executionCtx.waitUntil) {
        c.executionCtx.waitUntil(this.recordUsage(apiKey, transformedRequest.model, response));
      }

      return response;
    } catch (error) {
      console.error('Adapter process error:', error);
      return new Response(JSON.stringify({ 
        error: { 
          message: error instanceof Error ? error.message : 'Unknown error',
          type: 'internal_error'
        } 
      }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }
  }

  protected abstract validate(request: Request): Promise<any>;
  
  protected async callApi(request: any, apiKey: string): Promise<any> {
    const baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
    const streamSuffix = request.isStreaming ? ':streamGenerateContent?alt=sse' : ':generateContent';
    const url = `${baseUrl}/${request.model}${streamSuffix}`;

    // 按照BAK原版逻辑设置请求头
    const headers: Record<string, string> = {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'gemini-code-api/2.0.0'
    };

    // 流式请求设置正确的Accept头
    if (request.isStreaming) {
      headers['Accept'] = 'text/event-stream';
    }

    const response = await this.httpClient.post(url, request.body, { headers });

    // For streaming requests, check if the response failed
    if (request.isStreaming && !response.ok) {
      // Convert error response to a streaming format that transformers can handle
      const errorData = await response.json().catch(() => ({ 
        error: { 
          code: response.status, 
          message: response.statusText || 'API request failed' 
        } 
      }));
      
      // Create a ReadableStream that emits the error in SSE format
      const errorStream = new ReadableStream({
        start(controller) {
          const errorChunk = `data: ${JSON.stringify(errorData)}\n\n`;
          controller.enqueue(new TextEncoder().encode(errorChunk));
          controller.close();
        }
      });

      // Return a Response-like object with the error stream
      return new Response(errorStream, {
        status: 200, // Return 200 so transformers can process the error
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    return response;
  }

  protected async recordUsage(apiKey: string, model: string, response: Response): Promise<void> {
    // A simplified usage recording. A real implementation would parse tokens from the response.
    await this.dbStorage.recordUsage({
      keyHash: hashApiKey(apiKey),
      model: model,
      inputTokens: 100, // Placeholder
      outputTokens: 200, // Placeholder
      totalTokens: 300, // Placeholder
      statusCode: response.status,
    });
  }
}