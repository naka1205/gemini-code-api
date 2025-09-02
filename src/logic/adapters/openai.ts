// src/logic/adapters/openai.adapter.ts
import { BaseAdapter } from './base';
import { OpenAIValidator } from '../../api/validators/openai';
import { HttpClient } from '../../base/http/client';
import { BalancerService } from '../services/balancer';
import { CacheService } from '../services/cache';
import { DbStorage } from '../../base/storage/db';
import { ITransformer } from '../transformers/base';

export class OpenAIAdapter extends BaseAdapter {
  constructor(
    protected httpClient: HttpClient,
    protected balancer: BalancerService,
    protected cache: CacheService,
    protected dbStorage: DbStorage,
    transformer: ITransformer,
  ) {
    super(httpClient, balancer, cache, dbStorage, transformer);
  }

  protected async validate(request: Request): Promise<any> {
    return OpenAIValidator.validate(request);
  }
}