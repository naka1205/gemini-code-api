// src/logic/adapters/gemini.adapter.ts
import { BaseAdapter } from './base';
import { HttpClient } from '../../base/http/client';
import { BalancerService } from '../services/balancer';
import { EnhancedCacheService } from '../services/cache';
import { DbStorage } from '../../base/storage/db';
import { ITransformer } from '../transformers/base';

export class GeminiAdapter extends BaseAdapter {
  constructor(
    protected httpClient: HttpClient,
    protected balancer: BalancerService,
    protected cache: EnhancedCacheService,
    protected dbStorage: DbStorage,
    transformer: ITransformer,
  ) {
    super(httpClient, balancer, cache, dbStorage, transformer);
  }

  protected async validate(request: Request): Promise<any> {
    const body: any = await request.json();
    if (!body.contents) {
      throw new Error('Invalid Gemini request: "contents" field is missing.');
    }
    
    // Extract stream flag from the context if available
    return { ...body, model: body.model || 'gemini-2.5-flash', stream: body.stream === true };
  }

  // Override process method to handle streaming correctly
  async process(c: any, apiKeys: string[]): Promise<Response> {
    try {
      const request = c.req.raw;
      const validatedData = await this.validate(request);
      
      // Set streaming flag from route context
      if (c.isStream !== undefined) {
        validatedData.stream = c.isStream;
      }
      
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
      console.error('Gemini Adapter process error:', error);
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
}