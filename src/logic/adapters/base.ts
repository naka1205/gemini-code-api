
// src/logic/adapters/base.adapter.ts
import { HttpClient } from '../../base/http/client';
import { BalancerService } from '../services/balancer';
import { CacheService } from '../services/cache';
import { DbStorage } from '../../base/storage/db';
import { hashApiKey } from '../../common/utils';
import { ITransformer } from '../transformers/base';

export abstract class BaseAdapter {
  protected dbStorage: DbStorage;
  protected transformer: ITransformer;

  constructor(
    protected httpClient: HttpClient,
    protected balancer: BalancerService,
    protected cache: CacheService,
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

    return this.httpClient.post(url, request.body, {
      headers: { 
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });
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
