// src/logic/adapters/claude.adapter.ts
import { BaseAdapter } from './base';
import { ClaudeValidator } from '../../api/validators/claude';
import { ClaudeTransformer } from '../transformers/claude';
import { HttpClient } from '../../base/http/client';
import { BalancerService } from '../services/balancer';
import { EnhancedCacheService } from '../services/cache';
import { DbStorage } from '../../base/storage/db';

/**
 * Claude协议适配器
 * 遵循模板方法模式，继承BaseAdapter的通用流程
 * 只负责Claude特定的验证和转换逻辑
 */
export class ClaudeAdapter extends BaseAdapter {
  protected readonly format = 'claude';

  constructor(
    httpClient: HttpClient,
    balancer: BalancerService,
    cache: EnhancedCacheService,
    dbStorage: DbStorage,
  ) {
    // 创建Claude专用的转换器
    const transformer = new ClaudeTransformer();
    super(httpClient, balancer, cache, dbStorage, transformer);
  }

  /**
   * Claude特定的请求验证
   * 使用ClaudeValidator进行格式验证
   */
  protected async validate(request: Request): Promise<any> {
    return ClaudeValidator.validate(request);
  }

  /**
   * Claude特定的错误处理
   * 可以覆盖基类的错误处理逻辑
   */
  protected handleError(error: any): Response {
    // Claude API特定的错误格式
    const errorResponse = {
      error: {
        type: 'claude_api_error',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error.details || {}
      }
    };

    return new Response(JSON.stringify(errorResponse), {
      status: error.statusCode || 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}