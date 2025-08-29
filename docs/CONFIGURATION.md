# 配置说明

> Gemini Code API 的详细配置选项和参数说明

## 🔧 配置选项

### Load-Balancer配置

#### 免费方案速率限制
```typescript
// src/utils/constants.ts
export const FREE_TIER_LIMITS = {
  'gemini-2.5-pro': { rpm: 5, tpm: 250000, rpd: 100 },    // 高级模型
  'gemini-2.5-flash': { rpm: 10, tpm: 250000, rpd: 250 }, // 中级模型
  'gemini-2.0-flash': { rpm: 15, tpm: 1000000, rpd: 200 }, // 低级模型 - 已修正为官方文档标准
  'text-embedding-004': { rpm: 100, tpm: 1000000, rpd: 1000 },
} as const;
```

#### 存储配置
```typescript
// 黑名单配置（Cloudflare KV）
const BLACKLIST_CONFIG = {
  TTL: 24 * 60 * 60,                  // 黑名单24小时
  KEY_PREFIX: 'blacklist:',            // KV键前缀
} as const;

// 配额计算配置（D1数据库）
const QUOTA_CONFIG = {
  CLEANUP_DAYS: 30,                   // 清理30天前的日志
  BATCH_SIZE: 1000,                   // 批量查询大小
} as const;

// 内存缓存配置
const MEMORY_CACHE_CONFIG = {
  MODEL_LIST_TTL: 3600000,            // 模型列表1小时
  HEALTH_CHECK_TTL: 300000,           // 健康检查5分钟
  MAX_SIZE: 1000,                     // 最大缓存条目
} as const;
```

### 缓存配置

```typescript
export const CACHE_CONFIG = {
  MODEL_LIST_TTL: 3600000,        // 模型列表缓存1小时
  HEALTH_CHECK_TTL: 300000,       // 健康检查缓存5分钟
  KEY_METRICS_TTL: 600000,        // KEY指标缓存10分钟
  MAX_CACHE_SIZE: 1000,           // 最大缓存条目数
  MAX_MEMORY_USAGE: 50 * 1024 * 1024, // 最大内存使用50MB
  CLEANUP_INTERVAL: 300000,       // 清理间隔5分钟
} as const;
```

## 📁 配置文件详解

### wrangler.toml

主要的Cloudflare Workers配置文件：

```toml
name = "gemini-code-api"
main = "dist/index.js"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

# D1数据库配置
[[d1_databases]]
binding = "DB"
database_name = "gemini-code"
database_id = "your-database-id"

# KV命名空间配置（用于负载均衡器）
[[kv_namespaces]]
binding = "KV"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-id"

# 构建配置
[build]
command = "npm run build"

# 环境变量（可选）
[vars]
ENVIRONMENT = "production"
LOG_LEVEL = "info"

# 路由配置（可选）
routes = [
  { pattern = "api.yourdomain.com/*", zone_name = "yourdomain.com" }
]
```

### drizzle.config.ts

Drizzle ORM配置文件：

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  verbose: true,
  strict: true,
});
```

### tsconfig.json

TypeScript编译配置：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "verbatimModuleSyntax": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## 🔑 环境变量配置

### 必需环境变量

```bash
# Cloudflare Workers环境变量
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token

# 数据库配置
DATABASE_ID=your-database-id
KV_NAMESPACE_ID=your-kv-namespace-id
```

### 可选环境变量

```bash
# 日志级别
LOG_LEVEL=info  # debug, info, warn, error

# 缓存配置
CACHE_TTL=3600000
MAX_CACHE_SIZE=1000

# 性能配置
MAX_CONCURRENT_REQUESTS=100
REQUEST_TIMEOUT=30000

# 安全配置
ENABLE_RATE_LIMITING=true
MAX_REQUESTS_PER_MINUTE=1000
```

## 🗄️ 数据库配置

### 表结构配置

#### request_logs 表
```sql
CREATE TABLE IF NOT EXISTS request_logs (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  client_type TEXT NOT NULL,
  client_ip TEXT NOT NULL,
  user_agent TEXT,
  api_key_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  original_model TEXT,
  endpoint TEXT NOT NULL,
  response_time INTEGER NOT NULL,
  status_code INTEGER NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  is_stream INTEGER DEFAULT 0,
  has_error INTEGER DEFAULT 0,
  error_message TEXT,
  request_size INTEGER,
  response_size INTEGER
);
```

#### api_key_metrics 表
```sql
CREATE TABLE IF NOT EXISTS api_key_metrics (
  key_hash TEXT PRIMARY KEY,
  total_requests INTEGER DEFAULT 0,
  successful_requests INTEGER DEFAULT 0,
  failed_requests INTEGER DEFAULT 0,
  average_response_time REAL DEFAULT 0,
  last_response_time INTEGER,
  min_response_time INTEGER,
  max_response_time INTEGER,
  is_healthy INTEGER DEFAULT 1,
  last_health_check INTEGER,
  consecutive_failures INTEGER DEFAULT 0,
  last_failure_time INTEGER,
  total_tokens INTEGER DEFAULT 0,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  last_used INTEGER,
  first_seen INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### 索引配置

```sql
-- 请求日志索引
CREATE INDEX IF NOT EXISTS idx_request_logs_timestamp ON request_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_request_logs_client_type ON request_logs(client_type);
CREATE INDEX IF NOT EXISTS idx_request_logs_api_key_hash ON request_logs(api_key_hash);
CREATE INDEX IF NOT EXISTS idx_request_logs_model ON request_logs(model);
CREATE INDEX IF NOT EXISTS idx_request_logs_status_code ON request_logs(status_code);
CREATE INDEX IF NOT EXISTS idx_request_logs_has_error ON request_logs(has_error);

-- API密钥指标索引
CREATE INDEX IF NOT EXISTS idx_api_key_metrics_healthy ON api_key_metrics(is_healthy);
CREATE INDEX IF NOT EXISTS idx_api_key_metrics_last_used ON api_key_metrics(last_used);
CREATE INDEX IF NOT EXISTS idx_api_key_metrics_performance ON api_key_metrics(average_response_time, successful_requests);
```

## 🔄 负载均衡器配置

### 智能选择算法

```typescript
// 配额评分算法
interface QuotaScore {
  key: string;
  score: number;
  rpmRemaining: number;
  tpmRemaining: number;
  rpdRemaining: number;
  reason: string;
}

// 评分权重配置
const SCORE_WEIGHTS = {
  RPM: 0.4,    // 每分钟请求数权重
  TPM: 0.3,    // 每分钟令牌数权重
  RPD: 0.3,    // 每日请求数权重
} as const;
```

### 黑名单配置

```typescript
// 黑名单管理配置
const BLACKLIST_MANAGEMENT = {
  TTL: 24 * 60 * 60,              // 24小时TTL
  KEY_PREFIX: 'blacklist:',        // KV键前缀
  AUTO_RECOVERY: true,             // 自动恢复
  RECOVERY_THRESHOLD: 0.8,         // 恢复阈值（80%配额）
  MAX_BLACKLIST_DURATION: 7 * 24 * 60 * 60, // 最大黑名单时长7天
} as const;
```

## 📊 监控配置

### 健康检查配置

```typescript
// 健康检查配置
const HEALTH_CHECK_CONFIG = {
  INTERVAL: 30000,                 // 检查间隔30秒
  TIMEOUT: 10000,                  // 超时时间10秒
  RETRY_COUNT: 3,                  // 重试次数
  CRITICAL_THRESHOLD: 0.9,         // 关键阈值90%
  WARNING_THRESHOLD: 0.7,          // 警告阈值70%
} as const;
```

### 日志配置

```typescript
// 日志配置
const LOGGING_CONFIG = {
  LEVEL: 'info',                   // 日志级别
  FORMAT: 'json',                  // 日志格式
  ENABLE_DATABASE_LOGGING: true,   // 启用数据库日志
  ENABLE_ERROR_LOGGING: true,      // 启用错误日志
  ENABLE_PERFORMANCE_LOGGING: true, // 启用性能日志
  MAX_LOG_ENTRIES: 10000,          // 最大日志条目
  LOG_RETENTION_DAYS: 30,          // 日志保留天数
} as const;
```

## 🚀 性能优化配置

### 缓存优化

```typescript
// 缓存优化配置
const CACHE_OPTIMIZATION = {
  ENABLE_COMPRESSION: true,        // 启用压缩
  COMPRESSION_THRESHOLD: 1024,     // 压缩阈值1KB
  ENABLE_PARTITIONING: true,       // 启用分区
  PARTITION_SIZE: 1000,            // 分区大小
  ENABLE_PRELOADING: true,         // 启用预加载
  PRELOAD_THRESHOLD: 0.8,          // 预加载阈值
} as const;
```

### 数据库优化

```typescript
// 数据库优化配置
const DATABASE_OPTIMIZATION = {
  ENABLE_CONNECTION_POOLING: true, // 启用连接池
  MAX_CONNECTIONS: 10,             // 最大连接数
  CONNECTION_TIMEOUT: 30000,       // 连接超时
  QUERY_TIMEOUT: 60000,            // 查询超时
  ENABLE_QUERY_CACHING: true,      // 启用查询缓存
  QUERY_CACHE_TTL: 300000,         // 查询缓存TTL
  ENABLE_BATCH_OPERATIONS: true,   // 启用批量操作
  BATCH_SIZE: 1000,                // 批量大小
} as const;
```

## 🔒 安全配置

### 访问控制

```typescript
// 访问控制配置
const ACCESS_CONTROL = {
  ENABLE_IP_WHITELIST: false,      // 启用IP白名单
  ALLOWED_IPS: [],                 // 允许的IP地址
  ENABLE_GEO_RESTRICTION: false,   // 启用地理位置限制
  ALLOWED_COUNTRIES: [],           // 允许的国家
  ENABLE_RATE_LIMITING: true,      // 启用速率限制
  MAX_REQUESTS_PER_IP: 1000,      // 每个IP最大请求数
  RATE_LIMIT_WINDOW: 60000,        // 速率限制窗口
} as const;
```

### 认证配置

```typescript
// 认证配置
const AUTHENTICATION = {
  ENABLE_API_KEY_VALIDATION: true, // 启用API密钥验证
  ENABLE_SIGNATURE_VERIFICATION: false, // 启用签名验证
  ENABLE_JWT_VALIDATION: false,    // 启用JWT验证
  JWT_SECRET: '',                  // JWT密钥
  JWT_EXPIRY: 3600,               // JWT过期时间
} as const;
```

## 📋 配置最佳实践

### 生产环境配置

1. **启用所有安全特性**
   - 启用IP白名单
   - 启用地理位置限制
   - 启用速率限制

2. **优化性能配置**
   - 调整缓存TTL
   - 优化数据库连接池
   - 启用查询缓存

3. **监控和告警**
   - 配置健康检查
   - 设置性能阈值
   - 启用错误告警

### 开发环境配置

1. **简化配置**
   - 禁用安全限制
   - 减少缓存TTL
   - 启用详细日志

2. **快速调试**
   - 启用本地数据库
   - 禁用生产限制
   - 启用调试模式

## 🔍 配置验证

### 配置检查脚本

```bash
#!/bin/bash
# config-validator.sh

echo "🔍 验证 Gemini Code API 配置..."

# 检查必需文件
echo "📁 检查配置文件..."
if [ ! -f "wrangler.toml" ]; then
    echo "❌ 缺少 wrangler.toml"
    exit 1
fi

if [ ! -f "drizzle.config.ts" ]; then
    echo "❌ 缺少 drizzle.config.ts"
    exit 1
fi

if [ ! -f "tsconfig.json" ]; then
    echo "❌ 缺少 tsconfig.json"
    exit 1
fi

echo "✅ 配置文件检查通过"

# 检查环境变量
echo "🔑 检查环境变量..."
if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
    echo "⚠️  警告: CLOUDFLARE_ACCOUNT_ID 未设置"
fi

if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo "⚠️  警告: CLOUDFLARE_API_TOKEN 未设置"
fi

# 验证配置语法
echo "🔧 验证配置语法..."
npm run type-check

if [ $? -eq 0 ]; then
    echo "✅ 配置语法验证通过"
else
    echo "❌ 配置语法验证失败"
    exit 1
fi

echo "🎉 配置验证完成！"
```

## 📚 相关文档

- [部署指南](./DEPLOYMENT.md) - 完整的部署和配置说明
- [运维指南](./OPERATIONS.md) - 监控、维护和故障排除
- [存储架构](./STORAGE_ARCHITECTURE.md) - 存储系统设计详解
- [API参考](./API_REFERENCE.md) - 完整的API接口文档

## 🆘 获取帮助

如果遇到配置问题，请：

1. 检查配置语法和格式
2. 验证环境变量设置
3. 查看 [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
4. 提交 [GitHub Issue](https://github.com/your-repo/issues)
