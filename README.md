# Gemini Code API

> 🚀 高性能多协议AI网关服务，支持OpenAI、Claude与Gemini API的统一访问接口

一个基于Cloudflare Workers的轻量级AI代理服务，使用Google Gemini作为统一后端，对外提供多种AI服务API的兼容接口。

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-blue.svg)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)](https://workers.cloudflare.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

## ✨ 功能特性

### 🔄 多协议兼容
- **OpenAI API兼容**: 完整支持`/v1/chat/completions`、`/v1/embeddings`、`/v1/models`等接口
- **Claude API兼容**: 支持`/v1/messages`接口，兼容Anthropic Claude格式
- **Gemini原生API**: 直接支持`/v1beta/models/{model}/generateContent`等Gemini接口
- **自动协议识别**: 根据请求路径和头部自动识别客户端类型

### 🛡️ 纯代理安全模式
- **零密钥存储**: 系统不存储任何API密钥，完全由客户端提供
- **多密钥负载均衡**: 客户端可提供多个Gemini API密钥
- **智能密钥选择**: 基于性能指标自动选择最优密钥
- **安全隔离**: 每个请求使用独立的密钥池，用户间完全隔离

### ⚖️ 智能负载均衡
- **性能监控**: 实时监控API密钥的响应时间和成功率
- **健康检查**: 自动检测和排除不健康的密钥
- **自适应选择**: 基于加权算法选择最优密钥
- **故障转移**: 密钥失败时自动切换到备用密钥

### 🔥 高性能缓存
- **智能缓存**: LRU算法，支持TTL自动过期
- **内存管理**: 自适应内存清理，防止内存泄漏
- **缓存策略**: 模型列表缓存1小时，健康检查缓存5分钟
- **性能优化**: 缓存命中可显著减少API调用延迟

### 📊 全面监控
- **性能指标**: 响应时间、错误率、吞吐量等关键指标
- **实时告警**: 基于阈值的自动告警机制
- **趋势分析**: 性能变化趋势和置信度评估
- **健康检查**: `/health`端点提供服务状态检查

### 🌊 流式响应支持
- **Server-Sent Events**: 完整的SSE流式响应支持
- **实时输出**: 支持OpenAI和Claude的流式聊天
- **背压处理**: 智能的流式数据背压控制

## 🏗️ 系统架构

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client Apps   │────│  Gemini Code API │────│  Gemini API     │
│                 │    │                  │    │                 │
│ • OpenAI SDK    │    │ • Protocol       │    │ • gemini-pro    │
│ • Claude SDK    │    │   Adapters       │    │ • gemini-flash  │
│ • Gemini SDK    │    │ • Load Balancer  │    │ • text-embed    │
│ • Custom Apps   │    │ • Cache System   │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 📁 项目结构

```
src/
├── types/                  # 🏷️ 全局类型定义
│   ├── common.ts          # 通用类型和枚举
│   ├── api.ts             # API相关类型
│   ├── adapters.ts        # 适配器类型
│   ├── auth.ts            # 认证类型
│   ├── database.ts        # 数据库类型
│   ├── http.ts            # HTTP类型
│   └── services.ts        # 服务层类型
├── adapters/              # 🔄 协议适配器
│   ├── base/              # 基础适配器抽象
│   ├── openai/            # OpenAI协议适配
│   │   ├── chat.ts        # 聊天完成接口
│   │   ├── embeddings.ts  # 嵌入接口
│   │   ├── models.ts      # 模型列表
│   │   └── transformer.ts # 请求转换器
│   ├── claude/            # Claude协议适配
│   │   ├── messages.ts    # 消息接口
│   │   ├── streaming.ts   # 流式处理
│   │   └── transformer.ts # 消息转换器
│   └── gemini/            # Gemini原生接口
│       ├── native.ts      # 原生透传
│       └── models.ts      # 模型管理
├── middleware/            # 🛠️ 中间件系统
│   ├── auth/              # 认证中间件
│   │   ├── detector.ts    # 客户端识别
│   │   ├── extractor.ts   # 密钥提取
│   │   └── validator.ts   # 密钥验证
│   ├── cors.ts            # CORS处理
│   ├── logger.ts          # 请求日志
│   └── error-handler.ts   # 错误处理
├── services/              # ⚙️ 核心服务
│   ├── load-balancer/     # 负载均衡服务
│   │   ├── performance.ts # 性能监控
│   │   ├── selector.ts    # 密钥选择器
│   │   ├── health.ts      # 健康检查
│   │   └── metrics.ts     # 性能指标
│   ├── cache/             # 缓存服务
│   │   ├── manager.ts     # 缓存管理器
│   │   ├── memory.ts      # 内存缓存
│   │   └── ttl.ts         # TTL管理
│   └── http/              # HTTP客户端
│       ├── client.ts      # HTTP客户端
│       └── retry.ts       # 重试逻辑
├── routes/                # 🛣️ API路由
│   ├── v1/                # OpenAI/Claude
│   │   ├── chat.ts
│   │   ├── embeddings.ts
│   │   ├── models.ts
│   │   └── messages.ts
│   ├── v1beta/            # Gemini
│   │   ├── generate.ts
│   │   └── models.ts
│   └── health.ts          # 健康检查
├── database/              # 🗄️ 数据库层
│   ├── schema.ts          # 数据表结构
│   └── operations.ts      # 数据库操作
├── utils/                 # 🔧 工具函数
│   ├── constants.ts       # 常量配置
│   ├── helpers.ts         # 辅助函数
│   ├── validation.ts      # 验证工具
│   ├── format.ts          # 格式化工具
│   └── logger.ts          # 统一日志系统
└── index.ts               # 🚀 应用入口
```

## 🚀 快速部署

### 前提条件

- [Node.js](https://nodejs.org/) 18.0.0+
- [Cloudflare账户](https://dash.cloudflare.com/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- Google Gemini API密钥

### 1. 环境准备

```bash
# 安装Wrangler CLI
npm install -g wrangler

# 登录Cloudflare
wrangler login

# 克隆项目
git clone <repository-url>
cd gemini-code-api

# 安装依赖
npm install
```

### 2. 数据库配置

#### 创建D1数据库
```bash
# 创建数据库
npm run db:create

# 更新wrangler.toml中的database_id
# 复制命令输出的database_id到wrangler.toml文件中

# 执行数据库迁移
npm run db:migrate
```

#### 数据库结构
```sql
-- 请求日志表
CREATE TABLE request_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  client_type TEXT,
  client_ip TEXT,
  user_agent TEXT,
  api_key_hash TEXT,
  model TEXT,
  status_code INTEGER,
  response_time INTEGER,
  error_message TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER
);

-- API密钥性能指标表
CREATE TABLE api_key_metrics (
  key_hash TEXT PRIMARY KEY,
  total_requests INTEGER DEFAULT 0,
  successful_requests INTEGER DEFAULT 0,
  failed_requests INTEGER DEFAULT 0,
  average_response_time REAL DEFAULT 0,
  last_response_time INTEGER,
  consecutive_failures INTEGER DEFAULT 0,
  is_healthy BOOLEAN DEFAULT 1,
  last_used INTEGER,
  first_seen INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- 系统统计表
CREATE TABLE system_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  total_requests INTEGER DEFAULT 0,
  total_errors INTEGER DEFAULT 0,
  average_response_time REAL DEFAULT 0,
  unique_clients INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

### 3. 配置检查

检查`wrangler.toml`配置：

```toml
name = "gemini-code-api"
main = "dist/index.js"
compatibility_date = "2024-12-01"
node_compat = true

[[d1_databases]]
binding = "DB"
database_name = "gemini-code"
database_id = "your-database-id"  # 从步骤2获取

[build]
command = "npm run build"

# 单一环境部署配置
[dev]
port = 8787
local_protocol = "http"

# 资源限制
[limits]
cpu_ms = 30000
```

### 4. 构建和部署

```bash
# 类型检查
npm run type-check

# 运行测试
npm run test

# 构建项目
npm run build

# 部署到Cloudflare Workers
npm run deploy

# 查看部署日志
npm run logs
```

### 5. 验证部署

```bash
# 健康检查
curl https://your-worker.dev/health

# 测试OpenAI接口
curl -X POST https://your-worker.dev/v1/chat/completions \
  -H "Authorization: Bearer YOUR_GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## 📝 使用指南

### API密钥格式

支持以下三种格式提供Gemini API密钥：

```bash
# OpenAI格式 (Bearer Token)
Authorization: Bearer AIzaSy...

# Claude格式 (x-api-key)
x-api-key: AIzaSy...

# Gemini格式 (x-goog-api-key)
x-goog-api-key: AIzaSy...

# 多密钥负载均衡 (逗号分隔)
Authorization: Bearer AIzaSy...,AIzaSy...,AIzaSy...
```

### 接口兼容性

| 原始接口 | 兼容接口 | 说明 |
|---------|---------|------|
| OpenAI `/v1/chat/completions` | ✅ 完全兼容 | 支持流式和非流式 |
| OpenAI `/v1/embeddings` | ✅ 完全兼容 | 文本向量化 |
| OpenAI `/v1/models` | ✅ 完全兼容 | 模型列表 |
| Claude `/v1/messages` | ✅ 完全兼容 | 支持流式响应 |
| Gemini `/v1beta/generateContent` | ✅ 原生透传 | 直接转发 |

### 模型映射

```typescript
// OpenAI -> Gemini
'gpt-4' -> 'gemini-2.5-pro'
'gpt-4o' -> 'gemini-2.5-pro'
'gpt-3.5-turbo' -> 'gemini-2.5-flash'

// Claude -> Gemini
'claude-3-5-sonnet-20241022' -> 'gemini-2.5-pro'
'claude-3-5-haiku-20241022' -> 'gemini-2.5-flash'

// 嵌入模型
'text-embedding-ada-002' -> 'text-embedding-004'
```

## 🔧 配置选项

### 负载均衡配置

```typescript
// src/utils/constants.ts
export const LOAD_BALANCER_CONFIG = {
  MAX_CONSECUTIVE_ERRORS: 5,      // 连续失败阈值
  PERFORMANCE_WINDOW: 300000,     // 性能评估窗口(5分钟)
  RESPONSE_TIME_WEIGHT: 0.6,      // 响应时间权重
  SUCCESS_RATE_WEIGHT: 0.4,       // 成功率权重
  MIN_REQUESTS_FOR_STATS: 3,      // 统计最小请求数
  UNHEALTHY_THRESHOLD: 0.5,       // 不健康阈值(50%失败率)
  RECOVERY_CHECK_INTERVAL: 60000, // 恢复检查间隔(1分钟)
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

## 📊 监控和运维

### 性能监控

访问`/health`端点获取系统状态：

```json
{
  "status": "healthy",
  "timestamp": 1703123456789,
  "version": "2.0.0",
  "uptime": 86400,
  "metrics": {
    "requests_total": 10000,
    "requests_per_second": 12.5,
    "average_response_time": 850,
    "error_rate": 0.02,
    "cache_hit_rate": 0.85,
    "active_api_keys": 3,
    "healthy_api_keys": 3
  },
  "database": {
    "status": "connected",
    "tables": ["request_logs", "api_key_metrics", "system_stats"]
  }
}
```

### 日志查看

```bash
# 实时日志
npm run logs

# 过滤错误日志
wrangler tail --format pretty | grep ERROR

# 查看特定时间段日志
wrangler tail --since 2024-01-01T00:00:00Z
```

### 数据库管理

```bash
# 重置数据库
npm run db:reset

# 查看数据库内容
wrangler d1 execute gemini-code --command="SELECT * FROM request_logs LIMIT 10"

# 备份数据库
wrangler d1 export gemini-code --output backup.sql
```

## ⚠️ 重要注意事项

### 安全注意事项

1. **API密钥安全**
   - 系统采用纯代理模式，不存储任何API密钥
   - 密钥仅在请求处理期间临时存在于内存中
   - 确保客户端安全存储和传输Gemini API密钥

2. **访问控制**
   - 建议配置Cloudflare Access进行访问控制
   - 可通过Worker路由配置限制访问域名
   - 考虑实施IP白名单或地理位置限制

3. **速率限制**
   - Cloudflare Workers有每分钟请求数限制
   - Gemini API有自己的速率限制
   - 建议实施客户端请求频率控制

### 性能注意事项

1. **内存管理**
   - Workers运行时内存限制为128MB
   - 启用了智能缓存清理，但仍需监控内存使用
   - 大量并发请求时注意内存压力

2. **响应时间**
   - 冷启动可能导致首次请求较慢
   - 缓存命中可显著提升响应速度
   - 考虑使用Cloudflare的Durable Objects减少冷启动

3. **数据库性能**
   - D1数据库有并发写入限制
   - 日志写入采用异步批处理
   - 定期清理历史数据避免表过大

### 部署注意事项

1. **环境配置**
   - 确保Wrangler CLI版本兼容性
   - 检查Node.js版本（需要18.0.0+）
   - 验证Cloudflare账户权限

2. **数据库迁移**
   - 首次部署必须执行数据库迁移
   - 更新schema时需要手动执行迁移
   - 备份生产数据库后再执行迁移

3. **域名绑定**
   - 默认使用`.workers.dev`域名
   - 生产环境建议绑定自定义域名
   - 配置SSL证书确保HTTPS访问

### 故障排除

1. **常见错误**
   ```bash
   # 数据库连接失败
   Error: D1_ERROR: Database not found
   # 解决：检查wrangler.toml中的database_id

   # API密钥验证失败
   Error: Invalid Gemini API key format
   # 解决：确认密钥格式和有效性

   # 内存限制错误
   Error: Exceeded memory limit
   # 解决：检查缓存配置，减少并发处理
   ```

2. **调试模式**
   ```bash
   # 本地开发服务器
   wrangler dev --local

   # 详细日志模式
   wrangler tail --format pretty
   ```

3. **性能优化**
   - 监控缓存命中率，调整TTL设置
   - 分析API密钥性能，优化负载均衡权重
   - 定期清理数据库历史数据

## 📞 技术支持

- **文档**: [项目Wiki](./docs/)
- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **讨论**: [GitHub Discussions](https://github.com/your-repo/discussions)

## 🤝 贡献指南

欢迎提交Issue和Pull Request！请遵循以下规范：

1. Fork项目并创建feature分支
2. 确保代码通过所有测试：`npm run test`
3. 遵循TypeScript和ESLint规范
4. 提交前运行：`npm run type-check`
5. 编写清晰的commit message

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源协议。

---

<div align="center">

**🚀 让AI API访问更简单、更安全、更高效**

Made with ❤️ by Gemini Code Team

</div>