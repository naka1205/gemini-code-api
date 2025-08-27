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



interface BlacklistEntry {
  keyHash: string;
  reason: 'rpd_exceeded' | 'tpd_exceeded' | 'rate_limited';
  expiresAt: number;
}

/**
 * 精简多KEY智能负载均衡器
 */
export class SmartLoadBalancer {
  private kv: KVNamespace;
  private quotaManager: QuotaManager;

  constructor(kv: KVNamespace, db: D1Database) {
    this.kv = kv;
    this.quotaManager = new QuotaManager(db);
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
      throw new Error('No API keys provided');
    }

    const normalizedModel = this.normalizeModel(model);
    
    // 单KEY场景：直接检查黑名单和配额
    if (apiKeys.length === 1) {
      const singleKey = apiKeys[0];
      const keyHash = hashApiKey(singleKey);
      
      log.debug('Single API key scenario', {
        model: normalizedModel,
        keyHash: keyHash.substring(0, 8) + '...',
      });

      // 检查是否在黑名单中
      const isBlacklisted = await this.isKeyBlacklisted(singleKey);
      if (isBlacklisted) {
        log.warn('Single API key is blacklisted', {
          keyHash: keyHash.substring(0, 8) + '...',
          reason: 'single_key_blacklisted',
        });
        
        return {
          selectedKey: singleKey,
          selectedKeyHash: keyHash,
          reason: 'single_key_blacklisted',
          availableKeys: 1,
          healthyKeys: 0,
        };
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
      log.warn('No quota-available keys, using fallback', {
        selectedKey: hashApiKey(fallbackKey).substring(0, 8) + '...',
      });
      
      return {
        selectedKey: fallbackKey,
        selectedKeyHash: hashApiKey(fallbackKey),
        reason: 'fallback_no_quota',
        availableKeys: availableKeys.length,
        healthyKeys: availableKeys.length,
      };
    }

    log.info('Smart load balancer selected key', {
      model: normalizedModel,
      selectedKey: hashApiKey(bestKey).substring(0, 8) + '...',
      availableKeys: availableKeys.length,
    });

    return {
      selectedKey: bestKey,
      selectedKeyHash: hashApiKey(bestKey),
      reason: 'quota_optimized',
      availableKeys: availableKeys.length,
      healthyKeys: availableKeys.length,
    };
  }

  /**
   * 检查单个密钥是否在黑名单中
   */
  private async isKeyBlacklisted(apiKey: string): Promise<boolean> {
    const keyHash = hashApiKey(apiKey);
    const blacklistKey = `blacklist:${keyHash}`;
    
    try {
      const blacklistEntry = await this.kv.get<BlacklistEntry>(blacklistKey, 'json');
      
      if (!blacklistEntry) {
        return false; // 不在黑名单中
      }
      
      // 检查是否已过期
      if (Date.now() > blacklistEntry.expiresAt) {
        await this.kv.delete(blacklistKey);
        return false; // 黑名单已过期
      }
      
      return true; // 在黑名单中且未过期
    } catch (error) {
      log.warn('Error checking blacklist status', {
        keyHash: keyHash.substring(0, 8) + '...',
        error: error instanceof Error ? error.message : String(error),
      });
      return false; // 出错时默认不在黑名单中
    }
  }

  /**
   * 过滤黑名单密钥
   */
  private async filterBlacklistedKeys(apiKeys: string[]): Promise<string[]> {
    const availableKeys: string[] = [];
    
    for (const apiKey of apiKeys) {
      const keyHash = hashApiKey(apiKey);
      const blacklistKey = `blacklist:${keyHash}`;
      
      try {
        const blacklistEntry = await this.kv.get<BlacklistEntry>(blacklistKey, 'json');
        
        if (!blacklistEntry) {
          // 不在黑名单中
          availableKeys.push(apiKey);
        } else if (Date.now() > blacklistEntry.expiresAt) {
          // 黑名单已过期，自动移除
          await this.kv.delete(blacklistKey);
          availableKeys.push(apiKey);
          
          log.info('Auto-removed expired blacklist entry', {
            keyHash: keyHash.substring(0, 8) + '...',
            reason: blacklistEntry.reason,
          });
        }
        // 在黑名单中且未过期，跳过
      } catch (error) {
        log.warn('Error checking blacklist status', {
          keyHash: keyHash.substring(0, 8) + '...',
          error: error instanceof Error ? error.message : String(error),
        });
        // 出错时默认可用
        availableKeys.push(apiKey);
      }
    }
    
    return availableKeys;
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
    let oldestTime = 0;

    for (const apiKey of apiKeys) {
      const keyHash = hashApiKey(apiKey);
      const blacklistKey = `blacklist:${keyHash}`;
      
      try {
        const blacklistEntry = await this.kv.get<BlacklistEntry>(blacklistKey, 'json');
        if (blacklistEntry && blacklistEntry.expiresAt > oldestTime) {
          oldestTime = blacklistEntry.expiresAt;
          oldestKey = apiKey;
        }
      } catch (error) {
        // 忽略错误
      }
    }

    return {
      selectedKey: oldestKey,
      selectedKeyHash: hashApiKey(oldestKey),
      reason: 'oldest_blacklisted',
      availableKeys: apiKeys.length,
      healthyKeys: 0,
    };
  }

  /**
   * 标准化模型名称
   */
  private normalizeModel(model: string): string {
    const normalized = model.toLowerCase().trim();
    return MODEL_MAPPINGS[normalized as keyof typeof MODEL_MAPPINGS] || normalized;
  }

  /**
   * 记录API使用情况
   */
  async recordUsage(
    apiKey: string,
    model: string,
    inputTokens: number = 0,
    outputTokens: number = 0
  ): Promise<void> {
    const keyHash = hashApiKey(apiKey);
    const normalizedModel = this.normalizeModel(model);
    const limits = FREE_TIER_LIMITS[normalizedModel as keyof typeof FREE_TIER_LIMITS];
    
    if (!limits) {
      log.warn('Unknown model limits for usage recording', { model: normalizedModel });
      return;
    }

    try {
      // 检查当前配额使用情况
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
    const keyHash = hashApiKey(apiKey);
    const blacklistKey = `blacklist:${keyHash}`;
    
    const blacklistEntry: BlacklistEntry = {
      keyHash,
      reason,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24小时后过期
    };
    
    await this.kv.put(blacklistKey, JSON.stringify(blacklistEntry), {
      expirationTtl: 24 * 60 * 60, // 24小时
    });
    
    log.info('API key added to blacklist', {
      keyHash: keyHash.substring(0, 8) + '...',
      reason,
      expiresAt: new Date(blacklistEntry.expiresAt).toISOString(),
    });
  }

  /**
   * 获取负载均衡统计信息
   */
  async getStats(): Promise<{
    totalKeys: number;
    blacklistedKeys: number;
    quotaUtilization: number;
  }> {
    // 简化实现，返回基本统计信息
    return {
      totalKeys: 0,
      blacklistedKeys: 0,
      quotaUtilization: 0,
    };
  }
}
