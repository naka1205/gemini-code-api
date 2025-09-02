
// src/logic/services/balancer.service.ts
import { BlacklistService } from './blacklist';
import { QuotaService, QuotaCheckResult } from './quota';
import { hashApiKey } from '../../common/utils';
import { getGlobalLogger } from '../../base/logging/logger';

export interface BalancerStrategy {
  select(keys: string[], model: string, estimatedTokens?: number): Promise<string>;
}

export class SmartBalancerStrategy implements BalancerStrategy {
  private logger = getGlobalLogger();

  constructor(
    private quotaService: QuotaService,
    private blacklistService: BlacklistService
  ) {}

  async select(keys: string[], model: string, estimatedTokens: number = 1000): Promise<string> {
    if (keys.length === 0) {
      throw new Error('No API keys provided');
    }

    // Single KEY optimization
    if (keys.length === 1) {
      const key = keys[0];
      const keyHash = hashApiKey(key);
      
      // Check blacklist
      if (await this.blacklistService.isBlacklisted(keyHash)) {
        throw new Error('API key is blacklisted');
      }

      // Check quota
      const quotaResult = await this.quotaService.checkQuota(keyHash, model, estimatedTokens);
      if (!quotaResult.allowed) {
        throw new Error(`Quota limit exceeded: ${quotaResult.reason}`);
      }

      return key;
    }

    // Multi-KEY load balancing with quota and blacklist checking
    const availableKeys: Array<{ key: string, keyHash: string, quotaResult: QuotaCheckResult }> = [];
    
    for (const key of keys) {
      const keyHash = hashApiKey(key);
      
      try {
        // Check blacklist first (faster check)
        if (await this.blacklistService.isBlacklisted(keyHash)) {
          this.logger.debug('Key is blacklisted', { keyHash: keyHash.substring(0, 8) + '...' });
          continue;
        }

        // Check quota
        const quotaResult = await this.quotaService.checkQuota(keyHash, model, estimatedTokens);
        if (!quotaResult.allowed) {
          this.logger.debug('Key quota exceeded', { 
            keyHash: keyHash.substring(0, 8) + '...', 
            reason: quotaResult.reason 
          });
          continue;
        }

        availableKeys.push({ key, keyHash, quotaResult });
      } catch (error) {
        this.logger.warn('Error checking key availability', { 
          keyHash: keyHash.substring(0, 8) + '...' 
        });
        // Continue to next key
      }
    }

    if (availableKeys.length === 0) {
      throw new Error('No available API keys with sufficient quota and not blacklisted');
    }

    // Select the best key based on current utilization
    return this.selectOptimalKey(availableKeys);
  }

  /**
   * Select the optimal key based on current utilization
   * Prefers keys with lower utilization rates
   */
  private selectOptimalKey(availableKeys: Array<{ key: string, keyHash: string, quotaResult: QuotaCheckResult }>): string {
    // Calculate utilization score for each key (lower is better)
    const keysWithScores = availableKeys.map(({ key, keyHash, quotaResult }) => {
      const { limits, current } = quotaResult;
      
      // Calculate utilization percentages
      const rpmUtilization = current.rpm / limits.rpm;
      const tpmUtilization = current.tpm / limits.tpm;
      const rpdUtilization = current.rpd / limits.rpd;
      
      // Weighted utilization score (RPM gets highest weight as it's most immediate)
      const utilizationScore = (
        rpmUtilization * 0.5 +  // 50% weight on RPM
        tpmUtilization * 0.3 +  // 30% weight on TPM  
        rpdUtilization * 0.2    // 20% weight on RPD
      );

      return {
        key,
        keyHash,
        utilizationScore,
        rpmUtilization,
        tpmUtilization,
        rpdUtilization
      };
    });

    // Sort by utilization score (ascending - lower utilization first)
    keysWithScores.sort((a, b) => a.utilizationScore - b.utilizationScore);

    const selectedKey = keysWithScores[0];
    
    this.logger.debug('Selected optimal key', {
      keyHash: selectedKey.keyHash.substring(0, 8) + '...',
      utilizationScore: Math.round(selectedKey.utilizationScore * 100),
      rpmUtilization: Math.round(selectedKey.rpmUtilization * 100),
      tpmUtilization: Math.round(selectedKey.tpmUtilization * 100),
      rpdUtilization: Math.round(selectedKey.rpdUtilization * 100),
      totalAvailableKeys: availableKeys.length
    });

    return selectedKey.key;
  }
}

export class BalancerService {
  constructor(private strategy: BalancerStrategy) {}

  async selectOptimalKey(keys: string[], model: string, estimatedTokens?: number): Promise<string> {
    return this.strategy.select(keys, model, estimatedTokens);
  }
}
