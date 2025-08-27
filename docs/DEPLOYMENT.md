# 部署指南

> 完整的 Gemini Code API 部署和配置说明

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

### 2. 数据库和KV配置

#### 创建D1数据库
```bash
# 创建数据库
npm run db:create

# 更新wrangler.toml中的database_id
# 复制命令输出的database_id到wrangler.toml文件中

# 生成数据库迁移文件（基于schema.ts）
npm run db:generate

# 执行数据库迁移
npm run db:migrate
```

#### 创建KV命名空间
```bash
# 创建生产环境KV命名空间
wrangler kv:namespace create "gemini-code-kv"

# 创建开发环境KV命名空间
wrangler kv:namespace create "gemini-code-kv" --preview

# 更新wrangler.toml中的KV配置
# 将输出的ID分别填入id和preview_id字段
```

#### 数据库结构

数据库表结构定义在 `src/database/schema.ts` 文件中，使用 Drizzle ORM 的 TypeScript 语法。迁移文件会自动生成在 `migrations/` 目录中。

**注意**: 本项目直接使用 Cloudflare D1 数据库，无需本地数据库配置。所有数据库操作都通过 wrangler 命令进行。

**主要表结构：**
- **request_logs**: 请求日志表，记录所有API调用
- **api_key_metrics**: API密钥性能指标表
- **system_stats**: 系统统计表
- **error_logs**: 错误日志表

**迁移文件管理：**
```bash
# 基于schema.ts生成迁移文件
npm run db:generate

# 查看生成的迁移文件
ls migrations/

# 执行迁移到本地开发环境
npm run db:migrate:local

# 执行迁移到生产环境
npm run db:migrate
```

**直接查看数据：**
```bash
# 查看请求日志
wrangler d1 execute gemini-code --command="SELECT * FROM request_logs ORDER BY timestamp DESC LIMIT 10"

# 查看API密钥指标
wrangler d1 execute gemini-code --command="SELECT * FROM api_key_metrics"

# 查看系统统计
wrangler d1 execute gemini-code --command="SELECT * FROM system_stats ORDER BY date DESC"
```

### 3. 配置检查

检查`wrangler.toml`配置：

```toml
name = "gemini-code-api"
main = "dist/index.js"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "gemini-code"
database_id = "your-database-id"  # 从步骤2获取

# KV命名空间配置（用于负载均衡器）
[[kv_namespaces]]
binding = "KV"
id = "your-kv-namespace-id"  # 从Cloudflare Dashboard获取
preview_id = "your-preview-kv-id"  # 开发环境ID

[build]
command = "npm run build"
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

## 🔧 环境配置

### 开发环境

```bash
# 本地开发服务器
wrangler dev --local

# 本地数据库迁移
npm run db:migrate:local

# 本地KV操作
wrangler kv:namespace list --preview
```

### 生产环境

```bash
# 生产环境部署
npm run deploy

# 生产环境数据库迁移
npm run db:migrate

# 生产环境KV操作
wrangler kv:namespace list
```

## 📊 部署验证

### 健康检查

部署成功后，访问健康检查端点：

```bash
curl https://your-worker.dev/health
```

预期响应：
```json
{
  "status": "healthy",
  "timestamp": 1703123456789,
  "version": "2.0.0",
  "database": {
    "status": "connected",
    "tables": ["request_logs", "api_key_metrics", "system_stats"]
  }
}
```

### 功能测试

#### 测试OpenAI接口
```bash
curl -X POST https://your-worker.dev/v1/chat/completions \
  -H "Authorization: Bearer YOUR_GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

#### 测试Claude接口
```bash
curl -X POST https://your-worker.dev/v1/messages \
  -H "x-api-key: YOUR_GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 1000,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

#### 测试Gemini原生接口
```bash
curl -X POST https://your-worker.dev/v1beta/models/gemini-2.0-flash:generateContent \
  -H "x-goog-api-key: YOUR_GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "Hello!"}]}]
  }'
```

## ⚠️ 部署注意事项

### 安全配置

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

### 性能优化

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

### 域名配置

1. **默认域名**
   - 默认使用`.workers.dev`域名
   - 生产环境建议绑定自定义域名

2. **SSL证书**
   - Cloudflare自动提供SSL证书
   - 确保HTTPS访问正常工作

3. **DNS配置**
   - 在Cloudflare Dashboard中配置DNS记录
   - 支持A记录和CNAME记录

## 🔍 故障排除

### 常见错误

#### 数据库连接失败
```bash
Error: D1_ERROR: Database not found
```
**解决方案**: 检查wrangler.toml中的database_id是否正确

#### API密钥验证失败
```bash
Error: Invalid Gemini API key format
```
**解决方案**: 确认密钥格式和有效性

#### 内存限制错误
```bash
Error: Exceeded memory limit
```
**解决方案**: 检查缓存配置，减少并发处理

### 调试模式

```bash
# 本地开发服务器
wrangler dev --local

# 详细日志模式
wrangler tail --format pretty

# 查看Worker日志
wrangler tail --format pretty | grep ERROR
```

### 性能监控

```bash
# 查看实时性能指标
curl https://your-worker.dev/health

# 监控数据库状态
wrangler d1 execute gemini-code --command="SELECT 'request_logs' as table_name, COUNT(*) as count FROM request_logs UNION ALL SELECT 'api_key_metrics', COUNT(*) FROM api_key_metrics UNION ALL SELECT 'system_stats', COUNT(*) FROM system_stats UNION ALL SELECT 'error_logs', COUNT(*) FROM error_logs"

# 查看API密钥性能
wrangler d1 execute gemini-code --command="SELECT key_hash, total_requests, successful_requests, average_response_time FROM api_key_metrics ORDER BY total_requests DESC"
```

## 📚 相关文档

- [运维指南](./OPERATIONS.md) - 监控、维护和故障排除
- [配置说明](./CONFIGURATION.md) - 详细的配置选项和参数
- [存储架构](./STORAGE_ARCHITECTURE.md) - 存储系统设计详解
- [API参考](./API_REFERENCE.md) - 完整的API接口文档

## 🆘 获取帮助

如果遇到部署问题，请：

1. 检查 [故障排除](#-故障排除) 部分
2. 查看 [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
3. 提交 [GitHub Issue](https://github.com/your-repo/issues)
4. 加入 [GitHub Discussions](https://github.com/your-repo/discussions)