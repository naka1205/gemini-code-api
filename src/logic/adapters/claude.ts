// src/logic/adapters/claude.ts
import { BaseAdapter } from './base';
import { ClaudeValidator } from '../../api/validators/claude';
import { ClaudeTransformer } from '../transformers/claude';
import { HttpClient } from '../../base/http/client';
import { BalancerService } from '../services/balancer';
import { EnhancedCacheService } from '../services/cache';
import { DbStorage } from '../../base/storage/db';

export class ClaudeAdapter extends BaseAdapter {
  protected readonly format = 'claude';

  constructor(
    httpClient: HttpClient,
    balancer: BalancerService,
    cache: EnhancedCacheService,
    dbStorage: DbStorage,
  ) {
    const transformer = new ClaudeTransformer();
    super(httpClient, balancer, cache, dbStorage, transformer);
  }

  protected async validate(request: Request): Promise<any> {
    return ClaudeValidator.validate(request);
  }
}
