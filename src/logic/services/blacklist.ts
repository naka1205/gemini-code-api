// src/logic/services/blacklist.ts
import { KvStorage } from '../../base/storage/kv';

const BLACKLIST_PREFIX = 'blacklist:';
const BLACKLIST_TTL = 24 * 60 * 60; // 24 hours

export class BlacklistService {
  constructor(private kvStorage: KvStorage) {}

  async isBlacklisted(_keyHash: string): Promise<boolean> {
    // Temporarily disabled - always return false to bypass blacklist checks
    // TODO: Re-enable after fixing blacklist logic
    return false;
    
    // Original logic (commented out):
    // const entry = await this.kvStorage.get<{ expiresAt: number }>(`${BLACKLIST_PREFIX}${keyHash}`);
    // return entry ? Date.now() < entry.expiresAt : false;
  }

  async addToBlacklist(keyHash: string, reason: string): Promise<void> {
    const entry = {
      reason,
      expiresAt: Date.now() + BLACKLIST_TTL * 1000,
    };
    await this.kvStorage.put(`${BLACKLIST_PREFIX}${keyHash}`, entry, { expirationTtl: BLACKLIST_TTL });
  }
}