
// src/logic/services/quota.service.ts
import { DbStorage } from '../../base/storage/db';
import { FREE_TIER_LIMITS } from '../../config/limits';
import { getGlobalLogger } from '../../base/logging/logger';

export interface QuotaLimits {
  rpm: number;  // Requests per minute
  tpm: number;  // Tokens per minute  
  rpd: number;  // Requests per day
}

export interface QuotaUsage {
  rpm: number;
  tpm: number;
  rpd: number;
  timestamp: number;
}

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  limits: QuotaLimits;
  current: QuotaUsage;
  resetTime?: number;
}

export class QuotaService {
  private logger = getGlobalLogger();

  constructor(private dbStorage: DbStorage) {}

  /**
   * Check if the API key has sufficient quota for the request
   */
  async checkQuota(_keyHash: string, model: string, _estimatedTokens: number = 1000): Promise<QuotaCheckResult> {
    // Temporarily disabled - always allow requests to bypass quota checking
    // TODO: Re-enable after fixing database issues
    const limits = this.getModelLimits(model);
    return {
      allowed: true,
      limits,
      current: { rpm: 0, tpm: 0, rpd: 0, timestamp: Date.now() }
    };
    
    /* Original logic (commented out):
    try {
      const limits = this.getModelLimits(model);
      const current = await this.getCurrentUsage(keyHash, model);
      
      // Check RPM limit
      if (current.rpm >= limits.rpm) {
        return {
          allowed: false,
          reason: `Rate limit exceeded: ${current.rpm}/${limits.rpm} requests per minute`,
          limits,
          current,
          resetTime: this.getNextMinuteTimestamp()
        };
      }

      // Check RPD limit
      if (current.rpd >= limits.rpd) {
        return {
          allowed: false,
          reason: `Daily limit exceeded: ${current.rpd}/${limits.rpd} requests per day`,
          limits,
          current,
          resetTime: this.getNextDayTimestamp()
        };
      }

      // Check TPM limit (estimated)
      if (current.tpm + estimatedTokens > limits.tpm) {
        return {
          allowed: false,
          reason: `Token rate limit would be exceeded: ${current.tpm + estimatedTokens}/${limits.tpm} tokens per minute`,
          limits,
          current,
          resetTime: this.getNextMinuteTimestamp()
        };
      }

      return {
        allowed: true,
        limits,
        current
      };
    } catch (error) {
      this.logger.error('Error checking quota', error instanceof Error ? error : new Error(String(error)), { keyHash, model });
      // Fail open - allow request if quota check fails
      return {
        allowed: true,
        limits: this.getModelLimits(model),
        current: { rpm: 0, tpm: 0, rpd: 0, timestamp: Date.now() }
      };
    }
    */
  }

  /**
   * Record usage after successful request
   */
  async recordUsage(keyHash: string, model: string, tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }, statusCode: number = 200): Promise<void> {
    try {
      await this.dbStorage.recordUsage({
        keyHash,
        model,
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens,
        totalTokens: tokenUsage.totalTokens,
        statusCode
      });
    } catch (error) {
      this.logger.error('Error recording usage', error instanceof Error ? error : new Error(String(error)), { keyHash, model });
      // Don't throw - logging usage failure shouldn't break the request
    }
  }

  /**
   * Get current usage for the API key and model
   */
  private async getCurrentUsage(keyHash: string, model: string): Promise<QuotaUsage> {
    const now = Date.now();
    const minuteStart = Math.floor(now / 60000) * 60000; // Start of current minute
    const dayStart = Math.floor(now / 86400000) * 86400000; // Start of current day

    try {
      // Get RPM and RPD counts
      const usageStats = await this.dbStorage.getUsage(
        keyHash, 
        model, 
        Math.floor(minuteStart / 1000), 
        Math.floor(dayStart / 1000)
      );

      // Get TPM count (tokens used in current minute)
      const tpmQuery = `
        SELECT SUM(total_tokens) as tpm_count
        FROM request_logs 
        WHERE api_key_hash = ? 
          AND model = ? 
          AND timestamp >= ?
      `;
      const tpmResult = await this.dbStorage.execute(tpmQuery, [
        keyHash, 
        model, 
        Math.floor(minuteStart / 1000)
      ]);

      return {
        rpm: usageStats.rpm,
        tpm: tpmResult[0]?.tpm_count || 0,
        rpd: usageStats.rpd,
        timestamp: now
      };
    } catch (error) {
      this.logger.error('Error getting current usage', error instanceof Error ? error : new Error(String(error)), { keyHash, model });
      return { rpm: 0, tpm: 0, rpd: 0, timestamp: now };
    }
  }

  /**
   * Get rate limits for a specific model
   */
  private getModelLimits(model: string): QuotaLimits {
    // Map model to Gemini model if needed
    const geminiModel = model.startsWith('gemini-') ? model : 'gemini-2.5-flash';
    
    return FREE_TIER_LIMITS[geminiModel as keyof typeof FREE_TIER_LIMITS] || 
           FREE_TIER_LIMITS['gemini-2.5-flash'];
  }

  /*
  // Temporarily commented out - unused while quota checking is disabled
  private getNextMinuteTimestamp(): number {
    const now = Date.now();
    return Math.ceil(now / 60000) * 60000;
  }

  private getNextDayTimestamp(): number {
    const now = Date.now();
    return Math.ceil(now / 86400000) * 86400000;
  }
  */

  /**
   * Get quota status for monitoring/debugging
   */
  async getQuotaStatus(keyHash: string, model: string): Promise<{
    model: string;
    limits: QuotaLimits;
    usage: QuotaUsage;
    utilizationPercent: {
      rpm: number;
      tpm: number; 
      rpd: number;
    }
  }> {
    const limits = this.getModelLimits(model);
    const usage = await this.getCurrentUsage(keyHash, model);

    return {
      model,
      limits,
      usage,
      utilizationPercent: {
        rpm: Math.round((usage.rpm / limits.rpm) * 100),
        tpm: Math.round((usage.tpm / limits.tpm) * 100),
        rpd: Math.round((usage.rpd / limits.rpd) * 100)
      }
    };
  }
}
