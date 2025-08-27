# 存储架构

> Gemini Code API 存储系统设计详解

## 🏗️ 整体架构

### 混合存储架构

Gemini Code API 采用混合存储架构，结合了三种不同的存储技术，每种技术都有其特定的用途和优势：

```
┌─────────────────────────────────────────────────────────────┐
│                    Gemini Code API                         │
├─────────────────────────────────────────────────────────────┤
│  Load-Balancer Service                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │   Blacklist     │  │   Quota Calc    │  │   Memory    │ │
│  │   (Cloudflare   │  │   (D1 Database) │  │   Cache     │ │
│  │    KV)          │  │                 │  │             │ │
│  │                 │  │ • request_logs  │  │ • Models    │ │
│  │ • 24h TTL       │  │ • api_key_      │  │ • Health    │ │
│  │ • Distributed   │  │   metrics       │  │ • Fast      │ │
│  │ • Persistent    │  │ • Historical    │  │   Access    │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 🔑 Cloudflare KV 存储

### 用途和特点

**用途**: 黑名单状态管理
**特点**: 
- 分布式、持久化存储
- 支持TTL自动过期
- 全球边缘节点访问
- 高可用性和一致性

### 黑名单管理

```typescript
// 黑名单键结构
const BLACKLIST_KEY_PREFIX = 'blacklist:';
const BLACKLIST_TTL = 24 * 60 * 60; // 24小时

// 黑名单数据结构
interface BlacklistEntry {
  keyHash: string;
  reason: string;
  timestamp: number;
  expiresAt: number;
  model?: string;
  quotaExceeded?: {
    rpm?: boolean;
    tpm?: boolean;
    rpd?: boolean;
  };
}

// 黑名单操作
class BlacklistManager {
  async addToBlacklist(keyHash: string, reason: string, model?: string): Promise<void> {
    const entry: BlacklistEntry = {
      keyHash,
      reason,
      timestamp: Date.now(),
      expiresAt: Date.now() + BLACKLIST_TTL * 1000,
      model,
      quotaExceeded: this.parseQuotaReason(reason)
    };
    
    await this.kv.put(
      `${BLACKLIST_KEY_PREFIX}${keyHash}`,
      JSON.stringify(entry),
      { expirationTtl: BLACKLIST_TTL }
    );
  }

  async isBlacklisted(keyHash: string): Promise<boolean> {
    const entry = await this.kv.get(`${BLACKLIST_KEY_PREFIX}${keyHash}`);
    if (!entry) return false;
    
    const blacklistEntry: BlacklistEntry = JSON.parse(entry);
    return Date.now() < blacklistEntry.expiresAt;
  }

  async getBlacklistInfo(keyHash: string): Promise<BlacklistEntry | null> {
    const entry = await this.kv.get(`${BLACKLIST_KEY_PREFIX}${keyHash}`);
    if (!entry) return null;
    
    const blacklistEntry: BlacklistEntry = JSON.parse(entry);
    if (Date.now() >= blacklistEntry.expiresAt) {
      // 自动清理过期条目
      await this.kv.delete(`${BLACKLIST_KEY_PREFIX}${keyHash}`);
      return null;
    }
    
    return blacklistEntry;
  }
}
```

### KV 性能优化

```typescript
// 批量操作优化
class OptimizedBlacklistManager extends BlacklistManager {
  async batchAddToBlacklist(entries: Array<{keyHash: string, reason: string}>): Promise<void> {
    const batch = entries.map(({keyHash, reason}) => ({
      key: `${BLACKLIST_KEY_PREFIX}${keyHash}`,
      value: JSON.stringify({
        keyHash,
        reason,
        timestamp: Date.now(),
        expiresAt: Date.now() + BLACKLIST_TTL * 1000
      }),
      expirationTtl: BLACKLIST_TTL
    }));
    
    // 使用批量写入提高性能
    await this.kv.putMany(batch);
  }

  async getBlacklistStats(): Promise<BlacklistStats> {
    // 获取黑名单统计信息
    const keys = await this.kv.list({ prefix: BLACKLIST_KEY_PREFIX });
    
    let totalEntries = 0;
    let expiredEntries = 0;
    let activeEntries = 0;
    
    for (const key of keys.keys) {
      const entry = await this.kv.get(key.name);
      if (entry) {
        totalEntries++;
        const blacklistEntry: BlacklistEntry = JSON.parse(entry);
        if (Date.now() >= blacklistEntry.expiresAt) {
          expiredEntries++;
        } else {
          activeEntries++;
        }
      }
    }
    
    return { totalEntries, expiredEntries, activeEntries };
  }
}
```

## 🗄️ Cloudflare D1 数据库

### 用途和特点

**用途**: 配额计算、请求历史、性能指标
**特点**:
- SQLite兼容的分布式数据库
- 支持复杂查询和事务
- 持久化存储
- 支持索引和优化

### 数据库表结构

#### request_logs 表

```sql
-- 请求日志表 - 核心数据表
CREATE TABLE IF NOT EXISTS request_logs (
  id TEXT PRIMARY KEY,                    -- 唯一标识符
  timestamp INTEGER NOT NULL,             -- Unix时间戳
  client_type TEXT NOT NULL,              -- 客户端类型 (openai, claude, gemini)
  client_ip TEXT NOT NULL,                -- 客户端IP地址
  user_agent TEXT,                        -- 用户代理
  api_key_hash TEXT NOT NULL,             -- API密钥哈希
  model TEXT NOT NULL,                    -- 使用的模型
  original_model TEXT,                    -- 原始请求的模型
  endpoint TEXT NOT NULL,                 -- API端点
  response_time INTEGER NOT NULL,         -- 响应时间(毫秒)
  status_code INTEGER NOT NULL,           -- HTTP状态码
  input_tokens INTEGER,                   -- 输入令牌数
  output_tokens INTEGER,                  -- 输出令牌数
  total_tokens INTEGER,                   -- 总令牌数
  is_stream INTEGER DEFAULT 0,            -- 是否为流式请求
  has_error INTEGER DEFAULT 0,            -- 是否有错误
  error_message TEXT,                     -- 错误消息
  request_size INTEGER,                   -- 请求大小(字节)
  response_size INTEGER                   -- 响应大小(字节)
);

-- 性能优化索引
CREATE INDEX IF NOT EXISTS idx_request_logs_timestamp ON request_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_request_logs_api_key_hash ON request_logs(api_key_hash);
CREATE INDEX IF NOT EXISTS idx_request_logs_model ON request_logs(model);
CREATE INDEX IF NOT EXISTS idx_request_logs_status_code ON request_logs(status_code);
CREATE INDEX IF NOT EXISTS idx_request_logs_has_error ON request_logs(has_error);

-- 复合索引用于复杂查询
CREATE INDEX IF NOT EXISTS idx_request_logs_key_model_time ON request_logs(api_key_hash, model, timestamp);
CREATE INDEX IF NOT EXISTS idx_request_logs_time_status ON request_logs(timestamp, status_code);
```

#### api_key_metrics 表

```sql
-- API密钥性能指标表
CREATE TABLE IF NOT EXISTS api_key_metrics (
  key_hash TEXT PRIMARY KEY,              -- API密钥哈希
  total_requests INTEGER DEFAULT 0,       -- 总请求数
  successful_requests INTEGER DEFAULT 0,  -- 成功请求数
  failed_requests INTEGER DEFAULT 0,      -- 失败请求数
  average_response_time REAL DEFAULT 0,   -- 平均响应时间
  last_response_time INTEGER,             -- 最后响应时间
  min_response_time INTEGER,              -- 最小响应时间
  max_response_time INTEGER,              -- 最大响应时间
  is_healthy INTEGER DEFAULT 1,          -- 健康状态
  last_health_check INTEGER,              -- 最后健康检查时间
  consecutive_failures INTEGER DEFAULT 0, -- 连续失败次数
  last_failure_time INTEGER,             -- 最后失败时间
  total_tokens INTEGER DEFAULT 0,         -- 总令牌数
  total_input_tokens INTEGER DEFAULT 0,   -- 总输入令牌数
  total_output_tokens INTEGER DEFAULT 0,  -- 总输出令牌数
  last_used INTEGER,                     -- 最后使用时间
  first_seen INTEGER,                     -- 首次使用时间
  created_at INTEGER NOT NULL,            -- 创建时间
  updated_at INTEGER NOT NULL             -- 更新时间
);

-- 性能索引
CREATE INDEX IF NOT EXISTS idx_api_key_metrics_healthy ON api_key_metrics(is_healthy);
CREATE INDEX IF NOT EXISTS idx_api_key_metrics_last_used ON api_key_metrics(last_used);
CREATE INDEX IF NOT EXISTS idx_api_key_metrics_performance ON api_key_metrics(average_response_time, successful_requests);
CREATE INDEX IF NOT EXISTS idx_api_key_metrics_failures ON api_key_metrics(consecutive_failures, last_failure_time);
```

#### system_stats 表

```sql
-- 系统统计表
CREATE TABLE IF NOT EXISTS system_stats (
  date TEXT PRIMARY KEY,                  -- 日期 (YYYY-MM-DD)
  total_requests INTEGER DEFAULT 0,       -- 总请求数
  successful_requests INTEGER DEFAULT 0,  -- 成功请求数
  failed_requests INTEGER DEFAULT 0,      -- 失败请求数
  openai_requests INTEGER DEFAULT 0,      -- OpenAI请求数
  claude_requests INTEGER DEFAULT 0,      -- Claude请求数
  gemini_requests INTEGER DEFAULT 0,      -- Gemini请求数
  unknown_requests INTEGER DEFAULT 0,     -- 未知类型请求数
  total_tokens_used INTEGER DEFAULT 0,    -- 总令牌使用量
  total_input_tokens INTEGER DEFAULT 0,   -- 总输入令牌数
  total_output_tokens INTEGER DEFAULT 0,  -- 总输出令牌数
  average_response_time REAL DEFAULT 0,   -- 平均响应时间
  min_response_time INTEGER,              -- 最小响应时间
  max_response_time INTEGER,              -- 最大响应时间
  error_rate REAL DEFAULT 0,              -- 错误率
  timeout_count INTEGER DEFAULT 0,        -- 超时次数
  rate_limit_count INTEGER DEFAULT 0,     -- 速率限制次数
  auth_error_count INTEGER DEFAULT 0,     -- 认证错误次数
  total_request_size INTEGER DEFAULT 0,   -- 总请求大小
  total_response_size INTEGER DEFAULT 0,  -- 总响应大小
  stream_request_count INTEGER DEFAULT 0, -- 流式请求数
  unique_api_keys INTEGER DEFAULT 0,      -- 唯一API密钥数
  active_api_keys INTEGER DEFAULT 0,      -- 活跃API密钥数
  updated_at INTEGER NOT NULL             -- 更新时间
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_system_stats_date ON system_stats(date);
```

#### error_logs 表

```sql
-- 错误日志表
CREATE TABLE IF NOT EXISTS error_logs (
  id TEXT PRIMARY KEY,                    -- 唯一标识符
  timestamp INTEGER NOT NULL,             -- Unix时间戳
  error_type TEXT NOT NULL,               -- 错误类型
  error_message TEXT NOT NULL,            -- 错误消息
  error_stack TEXT,                       -- 错误堆栈
  request_id TEXT,                        -- 关联请求ID
  client_type TEXT,                       -- 客户端类型
  client_ip TEXT,                         -- 客户端IP
  endpoint TEXT,                          -- API端点
  method TEXT,                            -- HTTP方法
  api_key_hash TEXT,                      -- API密钥哈希
  status_code INTEGER,                    -- HTTP状态码
  user_agent TEXT,                        -- 用户代理
  referer TEXT,                           -- 引用页面
  context TEXT,                           -- 上下文信息
  created_at INTEGER NOT NULL             -- 创建时间
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_error_logs_error_type ON error_logs(error_type);
CREATE INDEX IF NOT EXISTS idx_error_logs_request_id ON error_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_api_key_hash ON error_logs(api_key_hash);
```

### 配额计算查询

```typescript
// 配额计算管理器
class QuotaManager {
  async getQuotaUsage(apiKey: string, model: string, timeWindow: 'minute' | 'day'): Promise<QuotaUsage> {
    const keyHash = hashApiKey(apiKey);
    const now = Math.floor(Date.now() / 1000);
    
    let timeFilter: string;
    if (timeWindow === 'minute') {
      timeFilter = `timestamp >= ${now - 60}`;
    } else {
      timeFilter = `timestamp >= ${now - 86400}`;
    }
    
    const query = `
      SELECT 
        COUNT(*) as request_count,
        COALESCE(SUM(total_tokens), 0) as token_count,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens
      FROM request_logs 
      WHERE api_key_hash = ? 
        AND model = ? 
        AND ${timeFilter}
        AND has_error = 0
    `;
    
    const result = await this.db.prepare(query).bind(keyHash, model).first();
    
    return {
      requestCount: result?.request_count || 0,
      tokenCount: result?.token_count || 0,
      inputTokens: result?.input_tokens || 0,
      outputTokens: result?.output_tokens || 0
    };
  }

  async hasQuotaAvailable(apiKey: string, model: string, estimatedTokens: number, limits: ModelLimits): Promise<QuotaCheck> {
    const keyHash = hashApiKey(apiKey);
    const now = Math.floor(Date.now() / 1000);
    
    // 检查RPM (Requests Per Minute)
    const rpmQuery = `
      SELECT COUNT(*) as count 
      FROM request_logs 
      WHERE api_key_hash = ? 
        AND model = ? 
        AND timestamp >= ${now - 60}
        AND has_error = 0
    `;
    
    const rpmResult = await this.db.prepare(rpmQuery).bind(keyHash, model).first();
    const currentRPM = rpmResult?.count || 0;
    
    if (currentRPM >= limits.rpm) {
      return { available: false, reason: 'rpm_exceeded', current: currentRPM, limit: limits.rpm };
    }
    
    // 检查TPM (Tokens Per Minute)
    const tpmQuery = `
      SELECT COALESCE(SUM(total_tokens), 0) as total 
      FROM request_logs 
      WHERE api_key_hash = ? 
        AND model = ? 
        AND timestamp >= ${now - 60}
        AND has_error = 0
    `;
    
    const tpmResult = await this.db.prepare(tpmQuery).bind(keyHash, model).first();
    const currentTPM = tpmResult?.total || 0;
    
    if (currentTPM + estimatedTokens > limits.tpm) {
      return { available: false, reason: 'tpm_exceeded', current: currentTPM, limit: limits.tpm };
    }
    
    // 检查RPD (Requests Per Day)
    const rpdQuery = `
      SELECT COUNT(*) as count 
      FROM request_logs 
      WHERE api_key_hash = ? 
        AND model = ? 
        AND timestamp >= ${now - 86400}
        AND has_error = 0
    `;
    
    const rpdResult = await this.db.prepare(rpdQuery).bind(keyHash, model).first();
    const currentRPD = rpdResult?.count || 0;
    
    if (currentRPD >= limits.rpd) {
      return { available: false, reason: 'rpd_exceeded', current: currentRPD, limit: limits.rpd };
    }
    
    return { available: true, reason: 'quota_available' };
  }
}
```

## 🧠 内存缓存

### 用途和特点

**用途**: 模型列表、健康检查、快速访问数据
**特点**:
- 极快的访问速度
- 内存中存储
- 支持TTL过期
- LRU淘汰策略

### 缓存管理器

```typescript
// 内存缓存管理器
class MemoryCacheManager {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private cleanupInterval: NodeJS.Timeout;

  constructor(maxSize: number = 1000, cleanupIntervalMs: number = 300000) {
    this.maxSize = maxSize;
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
  }

  set(key: string, value: any, ttl: number = 3600000): void {
    // 检查缓存大小
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    const entry: CacheEntry = {
      value,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl,
      accessCount: 0
    };

    this.cache.set(key, entry);
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // 检查是否过期
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // 更新访问计数和时间
    entry.accessCount++;
    entry.lastAccess = Date.now();
    
    return entry.value;
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();
    let lowestAccessCount = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      // 优先淘汰访问次数最少的条目
      if (entry.accessCount < lowestAccessCount) {
        lowestAccessCount = entry.accessCount;
        oldestKey = key;
        oldestTime = entry.lastAccess || entry.timestamp;
      } else if (entry.accessCount === lowestAccessCount && (entry.lastAccess || entry.timestamp) < oldestTime) {
        oldestKey = key;
        oldestTime = entry.lastAccess || entry.timestamp;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now >= entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  // 获取缓存统计信息
  getStats(): CacheStats {
    let totalEntries = 0;
    let expiredEntries = 0;
    let totalSize = 0;

    for (const [key, entry] of this.cache.entries()) {
      totalEntries++;
      totalSize += this.estimateSize(entry.value);
      
      if (Date.now() >= entry.expiresAt) {
        expiredEntries++;
      }
    }

    return {
      totalEntries,
      expiredEntries,
      activeEntries: totalEntries - expiredEntries,
      totalSize,
      maxSize: this.maxSize,
      hitRate: this.calculateHitRate()
    };
  }
}
```

### 缓存策略

```typescript
// 缓存策略配置
const CACHE_STRATEGIES = {
  MODEL_LIST: {
    key: 'model_list',
    ttl: 3600000,        // 1小时
    priority: 'high'      // 高优先级，不容易被淘汰
  },
  HEALTH_CHECK: {
    key: 'health_check',
    ttl: 300000,         // 5分钟
    priority: 'medium'    // 中等优先级
  },
  API_KEY_METRICS: {
    key: 'api_key_metrics',
    ttl: 600000,         // 10分钟
    priority: 'low'       // 低优先级，容易被淘汰
  },
  REQUEST_CACHE: {
    key: 'request_cache',
    ttl: 60000,          // 1分钟
    priority: 'low'       // 低优先级
  }
} as const;

// 智能缓存管理器
class SmartCacheManager extends MemoryCacheManager {
  private hitCounts = new Map<string, number>();
  private missCounts = new Map<string, number>();

  get(key: string): any | null {
    const value = super.get(key);
    
    if (value !== null) {
      // 命中
      this.hitCounts.set(key, (this.hitCounts.get(key) || 0) + 1);
    } else {
      // 未命中
      this.missCounts.set(key, (this.missCounts.get(key) || 0) + 1);
    }
    
    return value;
  }

  // 根据命中率调整TTL
  adjustTTL(key: string, baseTTL: number): number {
    const hits = this.hitCounts.get(key) || 0;
    const misses = this.missCounts.get(key) || 0;
    const total = hits + misses;
    
    if (total === 0) return baseTTL;
    
    const hitRate = hits / total;
    
    // 命中率高时增加TTL，命中率低时减少TTL
    if (hitRate > 0.8) {
      return baseTTL * 2;  // 双倍TTL
    } else if (hitRate < 0.2) {
      return baseTTL * 0.5; // 减半TTL
    }
    
    return baseTTL;
  }

  // 预热缓存
  async warmupCache(): Promise<void> {
    // 预热模型列表
    try {
      const models = await this.fetchModelsFromAPI();
      this.set(CACHE_STRATEGIES.MODEL_LIST.key, models, CACHE_STRATEGIES.MODEL_LIST.ttl);
    } catch (error) {
      console.warn('Failed to warmup model list cache:', error);
    }

    // 预热健康检查
    try {
      const health = await this.performHealthCheck();
      this.set(CACHE_STRATEGIES.HEALTH_CHECK.key, health, CACHE_STRATEGIES.HEALTH_CHECK.ttl);
    } catch (error) {
      console.warn('Failed to warmup health check cache:', error);
    }
  }
}
```

## 🔄 数据同步和一致性

### 跨存储数据同步

```typescript
// 数据同步管理器
class DataSyncManager {
  async syncBlacklistToDatabase(): Promise<void> {
    // 将KV中的黑名单数据同步到数据库
    const blacklistKeys = await this.kv.list({ prefix: 'blacklist:' });
    
    for (const key of blacklistKeys.keys) {
      const entry = await this.kv.get(key.name);
      if (entry) {
        const blacklistEntry: BlacklistEntry = JSON.parse(entry);
        
        // 更新数据库中的黑名单状态
        await this.db.prepare(`
          INSERT OR REPLACE INTO api_key_metrics 
          (key_hash, is_healthy, last_health_check, updated_at)
          VALUES (?, 0, ?, ?)
        `).bind(
          blacklistEntry.keyHash,
          blacklistEntry.timestamp,
          Date.now()
        ).run();
      }
    }
  }

  async syncDatabaseToCache(): Promise<void> {
    // 将数据库中的热点数据同步到缓存
    const hotApiKeys = await this.db.prepare(`
      SELECT key_hash, total_requests, average_response_time
      FROM api_key_metrics
      WHERE total_requests > 100
      ORDER BY total_requests DESC
      LIMIT 50
    `).all();

    for (const row of hotApiKeys.results) {
      this.cache.set(
        `api_key_metrics:${row.key_hash}`,
        row,
        CACHE_STRATEGIES.API_KEY_METRICS.ttl
      );
    }
  }

  // 定期同步任务
  startSyncTasks(): void {
    // 每5分钟同步一次黑名单到数据库
    setInterval(() => this.syncBlacklistToDatabase(), 5 * 60 * 1000);
    
    // 每10分钟同步一次数据库到缓存
    setInterval(() => this.syncDatabaseToCache(), 10 * 60 * 1000);
  }
}
```

### 一致性保证

```typescript
// 一致性检查器
class ConsistencyChecker {
  async checkBlacklistConsistency(): Promise<ConsistencyReport> {
    const report: ConsistencyReport = {
      totalEntries: 0,
      consistentEntries: 0,
      inconsistentEntries: 0,
      details: []
    };

    // 检查KV和数据库中的黑名单状态是否一致
    const blacklistKeys = await this.kv.list({ prefix: 'blacklist:' });
    
    for (const key of blacklistKeys.keys) {
      const entry = await this.kv.get(key.name);
      if (entry) {
        const blacklistEntry: BlacklistEntry = JSON.parse(entry);
        report.totalEntries++;
        
        // 检查数据库中的状态
        const dbEntry = await this.db.prepare(`
          SELECT is_healthy FROM api_key_metrics WHERE key_hash = ?
        `).bind(blacklistEntry.keyHash).first();
        
        const isConsistent = dbEntry && dbEntry.is_healthy === 0;
        
        if (isConsistent) {
          report.consistentEntries++;
        } else {
          report.inconsistentEntries++;
          report.details.push({
            keyHash: blacklistEntry.keyHash,
            kvStatus: 'blacklisted',
            dbStatus: dbEntry?.is_healthy === 1 ? 'healthy' : 'unknown',
            reason: 'Database status mismatch'
          });
        }
      }
    }
    
    return report;
  }

  async repairInconsistencies(): Promise<RepairReport> {
    const report: RepairReport = {
      repairedEntries: 0,
      failedRepairs: 0,
      details: []
    };

    const consistencyReport = await this.checkBlacklistConsistency();
    
    for (const detail of consistencyReport.details) {
      try {
        if (detail.kvStatus === 'blacklisted' && detail.dbStatus === 'healthy') {
          // 修复数据库状态
          await this.db.prepare(`
            UPDATE api_key_metrics 
            SET is_healthy = 0, updated_at = ? 
            WHERE key_hash = ?
          `).bind(Date.now(), detail.keyHash).run();
          
          report.repairedEntries++;
          report.details.push({
            keyHash: detail.keyHash,
            action: 'Updated database status to blacklisted',
            success: true
          });
        }
      } catch (error) {
        report.failedRepairs++;
        report.details.push({
          keyHash: detail.keyHash,
          action: 'Failed to repair inconsistency',
          success: false,
          error: error.message
        });
      }
    }
    
    return report;
  }
}
```

## 📊 性能监控和优化

### 存储性能指标

```typescript
// 存储性能监控器
class StoragePerformanceMonitor {
  async getStorageMetrics(): Promise<StorageMetrics> {
    const metrics: StorageMetrics = {
      kv: await this.getKVMetrics(),
      database: await this.getDatabaseMetrics(),
      cache: await this.getCacheMetrics(),
      timestamp: Date.now()
    };
    
    return metrics;
  }

  private async getKVMetrics(): Promise<KVMetrics> {
    const blacklistKeys = await this.kv.list({ prefix: 'blacklist:' });
    
    return {
      totalKeys: blacklistKeys.keys.length,
      blacklistEntries: blacklistKeys.keys.length,
      estimatedSize: this.estimateKVSize(blacklistKeys.keys)
    };
  }

  private async getDatabaseMetrics(): Promise<DatabaseMetrics> {
    const tableStats = await this.db.prepare(`
      SELECT 
        'request_logs' as table_name, COUNT(*) as count
      FROM request_logs 
      UNION ALL 
      SELECT 'api_key_metrics', COUNT(*) FROM api_key_metrics 
      UNION ALL 
      SELECT 'system_stats', COUNT(*) FROM system_stats 
      UNION ALL 
      SELECT 'error_logs', COUNT(*) FROM error_logs
    `).all();

    const stats: Record<string, number> = {};
    for (const row of tableStats.results) {
      stats[row.table_name] = row.count;
    }

    return {
      tableStats: stats,
      totalRecords: Object.values(stats).reduce((sum, count) => sum + count, 0),
      estimatedSize: this.estimateDatabaseSize(stats)
    };
  }

  private async getCacheMetrics(): Promise<CacheMetrics> {
    const cacheStats = this.cache.getStats();
    
    return {
      totalEntries: cacheStats.totalEntries,
      activeEntries: cacheStats.activeEntries,
      hitRate: cacheStats.hitRate,
      memoryUsage: cacheStats.totalSize,
      maxSize: cacheStats.maxSize
    };
  }
}
```

### 存储优化建议

```typescript
// 存储优化建议器
class StorageOptimizer {
  async generateOptimizationRecommendations(): Promise<OptimizationRecommendation[]> {
    const recommendations: OptimizationRecommendation[] = [];
    const metrics = await this.performanceMonitor.getStorageMetrics();
    
    // KV优化建议
    if (metrics.kv.totalKeys > 1000) {
      recommendations.push({
        type: 'kv_cleanup',
        priority: 'high',
        description: 'KV存储条目过多，建议清理过期条目',
        action: 'Run KV cleanup task',
        expectedImpact: 'Reduce memory usage and improve performance'
      });
    }
    
    // 数据库优化建议
    if (metrics.database.totalRecords > 100000) {
      recommendations.push({
        type: 'database_cleanup',
        priority: 'medium',
        description: '数据库记录过多，建议清理历史数据',
        action: 'Run database cleanup task',
        expectedImpact: 'Improve query performance and reduce storage costs'
      });
    }
    
    // 缓存优化建议
    if (metrics.cache.hitRate < 0.7) {
      recommendations.push({
        type: 'cache_optimization',
        priority: 'medium',
        description: '缓存命中率较低，建议调整缓存策略',
        action: 'Review and adjust cache TTL settings',
        expectedImpact: 'Improve response time and reduce API calls'
      });
    }
    
    return recommendations;
  }

  async executeOptimization(type: string): Promise<OptimizationResult> {
    switch (type) {
      case 'kv_cleanup':
        return await this.cleanupKV();
      case 'database_cleanup':
        return await this.cleanupDatabase();
      case 'cache_optimization':
        return await this.optimizeCache();
      default:
        throw new Error(`Unknown optimization type: ${type}`);
    }
  }
}
```

## 📚 相关文档

- [部署指南](./DEPLOYMENT.md) - 完整的部署和配置说明
- [运维指南](./OPERATIONS.md) - 监控、维护和故障排除
- [配置说明](./CONFIGURATION.md) - 详细的配置选项和参数
- [API参考](./API_REFERENCE.md) - 完整的API接口文档

## 🆘 获取帮助

如果遇到存储架构相关问题，请：

1. 检查存储配置和权限
2. 查看 [Cloudflare D1 文档](https://developers.cloudflare.com/d1/)
3. 查看 [Cloudflare KV 文档](https://developers.cloudflare.com/workers/kv/)
4. 提交 [GitHub Issue](https://github.com/your-repo/issues)
