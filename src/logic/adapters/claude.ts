// src/logic/adapters/claude.adapter.ts
import { BaseAdapter } from './base';
import { ClaudeValidator } from '../../api/validators/claude';
import { HttpClient } from '../../base/http/client';
import { BalancerService } from '../services/balancer';
import { EnhancedCacheService } from '../services/cache';
import { DbStorage } from '../../base/storage/db';
import { ITransformer } from '../transformers/base';

export class ClaudeAdapter extends BaseAdapter {
  protected readonly format = 'claude';

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
    return ClaudeValidator.validate(request);
  }
}