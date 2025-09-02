/**
 * 内存存储
 */

export class MemoryStorage {
  private store: Map<string, any> = new Map();

  get<T>(key: string): T | null {
    return this.store.get(key) || null;
  }

  set<T>(key: string, value: T): void {
    this.store.set(key, value);
  }
}
