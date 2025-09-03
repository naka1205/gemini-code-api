# 部署指南

## 项目概述
这是一个多协议AI API网关，使用Gemini作为统一后端，对外提供OpenAI、Claude、Gemini三种AI客户端API的兼容接口。

## 技术栈
- **运行时**: Cloudflare Workers (TypeScript 原生支持)
- **框架**: Hono.js
- **数据库**: Cloudflare D1 (SQLite)
- **缓存**: Cloudflare KV + 内存缓存
- **语言**: TypeScript (无需编译到JS)

## 部署前准备

### 1. 安装依赖
```bash
npm install
```

### 2. 创建Cloudflare资源
```bash
# 登录Cloudflare
wrangler login

# 创建D1数据库
wrangler d1 create gemini-code-db

# 创建KV命名空间
wrangler kv:namespace create "CACHE"

# 执行数据库迁移
wrangler d1 execute gemini-code-db --file=./migrations/001_initial.sql
```

### 3. 更新wrangler.toml配置
将创建的资源ID更新到`wrangler.toml`中：
```toml
[[d1_databases]]
binding = "DB"
database_name = "gemini-code-db"
database_id = "你的数据库ID"

[[kv_namespaces]]
binding = "KV"
id = "你的KV命名空间ID"
```

## 部署命令

### 本地开发
```bash
npm run dev
# 或者
wrangler dev src/main.ts
```

### 部署到生产环境
```bash
npm run deploy
# 或者
wrangler deploy src/main.ts
```

### 类型检查
```bash
npm run type-check
```

## API端点

### OpenAI兼容接口
```
POST /v1/chat/completions
```

### Claude兼容接口  
```
POST /v1/messages
```

### Gemini原生接口
```
POST /v1beta/models/{model}:generateContent
POST /v1beta/models/{model}:streamGenerateContent
```

### 健康检查
```
GET /health
```

## 环境变量配置

在Cloudflare Workers控制台或wrangler.toml中配置：

- `LOG_LEVEL`: 日志级别 (DEBUG, INFO, WARN, ERROR)
- `HTTP_TIMEOUT`: HTTP请求超时时间(毫秒)
- `CACHE_MAX_SIZE`: 内存缓存最大条目数
- `ALLOWED_ORIGINS`: CORS允许的来源(逗号分隔)

## API密钥使用

在请求头中包含Gemini API密钥：
```
Authorization: Bearer YOUR_GEMINI_API_KEY
```

支持多个密钥的负载均衡：
```
Authorization: Bearer key1,key2,key3
```

## 特性

- ✅ 多协议API兼容(OpenAI/Claude/Gemini)
- ✅ 智能负载均衡和重试机制
- ✅ 配额管理和速率限制
- ✅ 请求日志和性能监控
- ✅ 黑名单和缓存支持
- ✅ 完整的错误处理
- ✅ TypeScript类型安全
- ✅ 敏感信息自动脱敏

## 监控和调试

查看实时日志：
```bash
wrangler tail
```

查看D1数据库数据：
```bash
wrangler d1 execute gemini-code-db --command "SELECT * FROM request_logs LIMIT 10"
```

查看KV存储：
```bash
wrangler kv:key list --binding=KV
```

## 注意事项

1. **不需要构建步骤**: Cloudflare Workers原生支持TypeScript
2. **配额限制**: 注意Cloudflare Workers的CPU时间和请求限制
3. **数据库查询**: D1有查询时间限制，优化复杂查询
4. **内存使用**: Workers有内存限制，注意缓存大小

## 故障排除

### 常见问题
1. **TypeScript错误**: 运行`npm run type-check`检查类型错误
2. **部署失败**: 确保wrangler.toml配置正确
3. **数据库连接**: 确保D1数据库已创建并迁移
4. **API密钥**: 检查Gemini API密钥格式和权限

### 性能优化
1. 调整缓存大小和TTL
2. 优化数据库查询索引
3. 配置合适的重试策略
4. 监控请求响应时间