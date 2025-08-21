# Gemini Code API

一个高性能的多协议兼容 API 服务：使用 Google Gemini 模型作为后端，对外兼容 OpenAI、Claude 与原生 Gemini API。

## 功能特性

- **多协议兼容**：同时支持 OpenAI、Claude、原生 Gemini API 调用格式
- **自动客户端识别**：基于请求路径与头部自动识别客户端类型
- **智能负载均衡**：根据健康检查与性能对多组 API Key 进行选择
- **统一鉴权**：支持多种鉴权头部，按优先级解析
- **完善日志**：记录请求、令牌用量、客户端类型等信息
- **一致的错误处理**：按客户端协议返回对应错误格式

## 快速开始

### 安装依赖

```bash
npm install
```

### 本地开发

```bash

# 生成并应用本地 D1 数据库迁移
npm run db:generate
npm run db:migrate:local

```

### 测试与构建

```bash
npm run build
```

## 使用说明（简）

本服务同时兼容三种调用格式，按鉴权头部优先级解析：

1. `Authorization: Bearer ...`（OpenAI，优先级最高）
2. `x-api-key: ...` + `anthropic-version`（Claude，中等优先级）
3. `x-goog-api-key: ...`（Gemini，优先级最低）

常用示例：

### OpenAI 兼容
```bash
curl -X POST http://BASE_URL/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Claude 兼容
```bash
curl -X POST http://BASE_URL/v1/messages \
  -H "x-api-key: YOUR_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-sonnet-20240229",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### 原生 Gemini
```bash
curl -X POST http://BASE_URL/v1/models/gemini-pro:generateContent \
  -H "x-goog-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "Hello!"}]}]
  }'
```

## 开发说明

### 先决条件

- Node.js 18+
- Cloudflare 账号与 Wrangler CLI
- Cloudflare D1（用于日志与元数据）

### 常用脚本

- `npm run build`：TypeScript 构建
- `npm run deploy`：部署到 Cloudflare Workers
- `npm run db:generate`：根据 `drizzle` 生成迁移
- `npm run db:migrate`：将迁移应用到远端 D1
- `npm run db:migrate:local`：将迁移应用到本地 D1

### 目录结构

```
src/
├── routes/          # 多客户端协议的 API 路由
│   └── v1/
│       ├── chat/    # OpenAI chat completions
│       ├── messages.post.ts  # Claude messages API
│       └── [...path].post.ts # 原生 Gemini API 透传
├── adapters/        # 协议适配层（OpenAI、Claude）
├── utils/           # 工具与服务
│   ├── auth.ts      # 鉴权与客户端识别
│   ├── load-balancer.ts  # 智能负载均衡
│   └── logging.ts   # 请求日志
├── types/           # 类型定义
└── index.ts         # 应用入口
```

## 部署说明（Cloudflare Workers）

下述步骤将本项目部署到 Cloudflare Workers，并配置 D1 与密钥：

1) 登录并选择账号

```bash
npx wrangler login
```

2) 创建或确认 D1 数据库

```bash
# 若尚未创建
npx wrangler d1 create gemini-code

# 记录输出中的 database_id
```

3) 配置 `wrangler.toml`

确保 `[[d1_databases]]` 中的 `database_id` 为你账号下 D1 的实际 ID（如下仅示例，需替换）：

```toml
[[d1_databases]]
binding = "DB"
database_name = "gemini-code"
database_id = "<your-database-id>"
```


4 应用数据库迁移（远端）

```bash
npm run db:migrate
```

5) 部署到 Workers

```bash
npm run deploy
```

完成上述步骤后，即可使用本文“使用说明”中的任一协议示例进行调用。

## 错误与日志

- OpenAI 错误格式：`{"error": {"message": "...", "type": "...", "code": "..."}}`
- Claude 错误格式：`{"type": "error", "error": {"type": "...", "message": "..."}}`
- Gemini：返回原生错误

服务会将请求与客户端类型等日志写入 D1，便于后续观测与分析。

## 许可证

MIT