// src/base/storage/kv.ts

export class KvStorage {
  private kv: any; // Replace with actual KV namespace type

  constructor(kvNamespace: any) {
    this.kv = kvNamespace;
  }

  async get<T>(key: string): Promise<T | null> {
    return this.kv.get(key, { type: 'json' });
  }

  async put(key: string, value: any, options?: { expirationTtl?: number }): Promise<void> {
    await this.kv.put(key, JSON.stringify(value), options);
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }
}
