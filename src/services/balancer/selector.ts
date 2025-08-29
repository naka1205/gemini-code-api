/**
 * 精简多KEY智能负载均衡器
 * 基于Gemini API免费方案速率限制的智能选择
 * 使用现有数据库和KV缓存实现
 */

import type { LoadBalancerResult } from '../../types/services.js';
import type { D1Database } from '@cloudflare/workers-types';
import { hashApiKey } from '../../utils/helpers.js';
import { log } from '../../utils/logger.js';
import { FREE_TIER_LIMITS, MODEL_MAPPINGS } from '../../utils/constants.js';
import { QuotaManager } from './manager.js';
import { BlacklistManager } from './blacklist.js';
import { throwError } from '../../middleware/error-handler.js';

/**
 * 精简多KEY智能负载均衡器
 */
export class SmartLoadBalancer {
  private blacklistManager: BlacklistManager;
  private quotaManager: QuotaManager;

  constructor(kv: KVNamespace, db: D1Database) {
    this.blacklistManager = new BlacklistManager(kv);
    this.quotaManager = new QuotaManager(db, this.blacklistManager);
  }

  /**
   * 智能选择最优API密钥
   * 自动判断单KEY和多KEY场景
   */
  async selectOptimalKey(
    apiKeys: string[],
    model: string,
    estimatedTokens: number = 0
  ): Promise<LoadBalancerResult> {
    if (!apiKeys || apiKeys.length === 0) {
      throwError.authentication('No API keys provided');
    }

    const normalizedModel = this.normalizeModel(model);
    
    // 单KEY场景：直接使用该密钥
    if (apiKeys.length === 1) {
      const singleKey = apiKeys[0];
      const keyHash = hashApiKey(singleKey);
      
      // 检查是否在黑名单中
      const isBlacklisted = await this.isKeyBlacklisted(singleKey);
      if (isBlacklisted) {
        log.warn('Single API key is blacklisted', {
          keyHash: keyHash.substring(0, 8) + '...',
          reason: 'single_key_blacklisted',
        });
        
        // 如果唯一的密钥被黑名单，应该返回错误而不是继续使用
        throwError.authentication(`API key is blacklisted. Please try again later or use a different API key.`);
      }

      // 检查配额是否充足
      const limits = FREE_TIER_LIMITS[normalizedModel as keyof typeof FREE_TIER_LIMITS];
      if (limits) {
        const quotaCheck = await this.quotaManager.hasQuotaAvailable(
          singleKey,
          normalizedModel,
          estimatedTokens,
          limits
        );
        
        if (!quotaCheck.available) {
          log.warn('Single API key quota exceeded', {
            keyHash: keyHash.substring(0, 8) + '...',
            reason: quotaCheck.reason,
          });
          
          return {
            selectedKey: singleKey,
            selectedKeyHash: keyHash,
            reason: `single_key_${quotaCheck.reason}`,
            availableKeys: 1,
            healthyKeys: 0,
          };
        }
      }

      // 单KEY可用
      return {
        selectedKey: singleKey,
        selectedKeyHash: keyHash,
        reason: 'single_key_available',
        availableKeys: 1,
        healthyKeys: 1,
      };
    }

    // 多KEY场景：使用负载均衡算法
    log.debug('Multiple API keys scenario, using load balancer', {
      model: normalizedModel,
      availableKeys: apiKeys.length,
      estimatedTokens,
    });

    // 1. 过滤黑名单密钥
    const availableKeys = await this.filterBlacklistedKeys(apiKeys);
    
    if (availableKeys.length === 0) {
      log.warn('All API keys are blacklisted, selecting oldest blacklisted key');
      return this.selectOldestBlacklistedKey(apiKeys);
    }

    // 2. 检查配额并选择最优密钥
    const bestKey = await this.selectBestKeyByQuota(availableKeys, normalizedModel, estimatedTokens);
    
    if (!bestKey) {
      // 如果没有配额充足的密钥，选择第一个
      const fallbackKey = availableKeys[0];
      const fallbackKeyHash = hashApiKey(fallbackKey);
      log.warn('No quota-available keys, using fallback', {
        selectedKey: fallbackKeyHash.substring(0, 8) + '...',
      });
      
      return {
        selectedKey: fallbackKey,
        selectedKeyHash: fallbackKeyHash,
        reason: 'fallback_no_quota',
        availableKeys: availableKeys.length,
        healthyKeys: availableKeys.length,
      };
    }

    const selectedKeyHash = hashApiKey(bestKey);
    log.info('Smart load balancer selected key', {
      model: normalizedModel,
      selectedKey: selectedKeyHash.substring(0, 8) + '...',
      availableKeys: availableKeys.length,
    });

    return {
      selectedKey: bestKey,
      selectedKeyHash: selectedKeyHash,
      reason: 'quota_optimized',
      availableKeys: availableKeys.length,
      healthyKeys: availableKeys.length,
    };
  }

  /**
   * 检查单个密钥是否在黑名单中
   */
  private async isKeyBlacklisted(apiKey: string): Promise<boolean> {
    return await this.blacklistManager.isBlacklisted(apiKey);
  }

  /**
   * 过滤黑名单密钥
   */
  private async filterBlacklistedKeys(apiKeys: string[]): Promise<string[]> {
    return await this.blacklistManager.filterBlacklistedKeys(apiKeys);
  }

  /**
   * 根据配额选择最佳密钥
   */
  private async selectBestKeyByQuota(
    apiKeys: string[],
    model: string,
    _estimatedTokens: number
  ): Promise<string | null> {
    const limits = FREE_TIER_LIMITS[model as keyof typeof FREE_TIER_LIMITS];
    if (!limits) {
      log.warn('Unknown model limits, using default', { model });
      return apiKeys[0] || null;
    }

    // 使用配额管理器获取所有密钥的配额状态
    const quotaStatuses = await this.quotaManager.getMultipleQuotaStatus(
      apiKeys,
      model,
      limits
    );

    // 过滤出可用的密钥并按评分排序
    const availableKeys = quotaStatuses
      .filter(status => status.isAvailable)
      .sort((a, b) => b.score - a.score);

    if (availableKeys.length === 0) {
      return null; // 没有可用的密钥
    }

    // 返回评分最高的密钥
    return availableKeys[0].apiKey;
  }

  /**
   * 选择最老的黑名单密钥（最可能已恢复）
   */
  private async selectOldestBlacklistedKey(apiKeys: string[]): Promise<LoadBalancerResult> {
    let oldestKey = apiKeys[0];
    let oldestExpiry = Date.now();
    
    // 找到最老的黑名单密钥
    for (const apiKey of apiKeys) {
      try {
        const blacklistEntry = await this.blacklistManager.getBlacklistEntry(apiKey);
        if (blacklistEntry && blacklistEntry.expiresAt < oldestExpiry) {
          oldestKey = apiKey;
          oldestExpiry = blacklistEntry.expiresAt;
        }
      } catch (error) {
        const keyHash = hashApiKey(apiKey);
        log.warn('Error checking blacklist entry for oldest key selection', {
          keyHash: keyHash.substring(0, 8) + '...',
          error: error instanceof Error ? error.message : String(error),
        } as any);
      }
    }
    
    const selectedKeyHash = hashApiKey(oldestKey);
    log.warn('All keys blacklisted, selecting oldest blacklisted key', {
      selectedKey: selectedKeyHash.substring(0, 8) + '...',
      expiresAt: new Date(oldestExpiry).toISOString(),
    });
    
    return {
      selectedKey: oldestKey,
      selectedKeyHash: selectedKeyHash,
      reason: 'all_keys_blacklisted_fallback',
      availableKeys: apiKeys.length,
      healthyKeys: 0,
    };
  }

  /**
   * 标准化模型名称
   */
  private normalizeModel(model: string): string {
    // 检查是否是Gemini模型
    if (model.startsWith('gemini-')) {
      return model;
    }
    
    // 检查OpenAI模型映射
    const mappedModel = MODEL_MAPPINGS[model as keyof typeof MODEL_MAPPINGS];
    if (mappedModel) {
      return mappedModel;
    }
    
    // 默认返回原始模型名称
    return model;
  }

  /**
   * 记录API密钥使用情况
   */
  async recordUsage(
    apiKey: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    context?: {
      originalModel?: string;
      endpoint?: string;
      clientType?: string;
      statusCode?: number;
      responseTimeMs?: number;
      clientIP?: string;
      userAgent?: string;
      isStream?: boolean;
      requestSize?: number;
      responseSize?: number;
    }
  ): Promise<void> {
    const keyHash = hashApiKey(apiKey);
    const normalizedModel = this.normalizeModel(model);
    
    try {
      // 记录到数据库
      await this.quotaManager.recordUsage(apiKey, normalizedModel, inputTokens, outputTokens, context);
      
      // 检查配额是否超限
      const limits = FREE_TIER_LIMITS[normalizedModel as keyof typeof FREE_TIER_LIMITS];
      if (!limits) {
        return;
      }
      
      const quotaCheck = await this.quotaManager.hasQuotaAvailable(
        apiKey,
        normalizedModel,
        inputTokens + outputTokens,
        limits
      );
      
      // 如果配额不足，加入黑名单
      if (!quotaCheck.available) {
        await this.addToBlacklist(apiKey, quotaCheck.reason as any);
        
        log.warn('API key quota exceeded, added to blacklist', {
          keyHash: keyHash.substring(0, 8) + '...',
          reason: quotaCheck.reason,
          usage: quotaCheck.usage,
        });
      }
    } catch (error) {
      log.error('Error recording usage', error instanceof Error ? error : undefined, {
        keyHash: keyHash.substring(0, 8) + '...',
      });
    }
  }

  /**
   * 处理API错误
   */
  async handleApiError(
    apiKey: string,
    _model: string,
    error: any
  ): Promise<void> {
    const keyHash = hashApiKey(apiKey);
    
    // 检查是否是速率限制错误
    if (error?.status === 429) {
      const errorMessage = error?.message?.toLowerCase() || '';
      
      let reason: 'rpd_exceeded' | 'tpd_exceeded' | 'rate_limited' = 'rate_limited';
      
      if (errorMessage.includes('daily') || errorMessage.includes('quota')) {
        reason = 'rpd_exceeded';
      } else if (errorMessage.includes('token')) {
        reason = 'tpd_exceeded';
      }
      
      await this.addToBlacklist(apiKey, reason);
      
      log.warn('API key blacklisted due to rate limit error', {
        keyHash: keyHash.substring(0, 8) + '...',
        reason,
        errorMessage: error?.message || 'Unknown error',
      });
    }
  }

  /**
   * 添加密钥到黑名单
   */
  private async addToBlacklist(
    apiKey: string,
    reason: 'rpd_exceeded' | 'tpd_exceeded' | 'rate_limited'
  ): Promise<void> {
    try {
      const result = await this.blacklistManager.addToBlacklist(apiKey, reason);
      if (result.success) {
        log.info('API key added to blacklist', {
          keyHash: result.keyHash.substring(0, 8) + '...',
          reason,
          expiresAt: result.expiresAt ? new Date(result.expiresAt).toISOString() : 'N/A',
        });
      }
    } catch (error) {
      const keyHash = hashApiKey(apiKey);
      log.error('Failed to add API key to blacklist', {
        keyHash: keyHash.substring(0, 8) + '...',
        reason,
        error: error instanceof Error ? error.message : String(error),
      } as any);
    }
  }

  /**
   * 获取负载均衡统计信息
   */
  async getStats(): Promise<{
    totalKeys: number;
    blacklistedKeys: number;
    quotaUtilization: number;
  }> {
    // 实现真实的统计信息收集
    try {
      // 这里可以添加真实的统计逻辑
      // 暂时返回基本信息
      return {
        totalKeys: 0,
        blacklistedKeys: 0,
        quotaUtilization: 0,
      };
    } catch (error) {
      log.error('Error getting load balancer stats', error instanceof Error ? error : undefined);
      return {
        totalKeys: 0,
        blacklistedKeys: 0,
        quotaUtilization: 0,
      };
    }
  }
}
