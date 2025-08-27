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
- **单KEY优化**: 自动识别单KEY场景，直接检查黑名单和配额状态
- **多KEY负载均衡**: 基于Gemini API免费方案速率限制的智能选择
- **配额感知**: 实时监控RPM/TPM/RPD使用情况，优先选择配额充足的密钥
- **黑名单机制**: 达到日限额的密钥自动加入黑名单24小时，支持自动恢复
- **故障转移**: 所有密钥被黑名单时选择最可能恢复的密钥

### 🔥 高性能缓存
- **混合缓存架构**: KV存储（黑名单）+ D1数据库（配额计算）+ 内存缓存（快速访问）
- **智能缓存**: LRU算法，支持TTL自动过期
- **性能优化**: 缓存命中可显著减少API调用延迟

### 📊 全面监控
- **性能指标**: 响应时间、错误率、吞吐量等关键指标
- **健康检查**: `/health`端点提供服务状态检查
- **实时日志**: 完整的请求日志和错误追踪

### 🌊 流式响应支持
- **Server-Sent Events**: 完整的SSE流式响应支持
- **实时输出**: 支持OpenAI和Claude的流式聊天
- **背压处理**: 智能的流式数据背压控制

## 🏗️ 系统架构

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client Apps   │────│  Gemini Code API │────│  Gemini API     │
│                 │    │                  │    │                 │
│ • OpenAI SDK    │    │ • Adapters       │    │ • gemini-pro    │
│ • Claude SDK    │    │ • Balancer       │    │ • gemini-flash  │
│ • Gemini SDK    │    │ • Cache          │    │ • text-embed    │
│ • Custom Apps   │    │ • Database       │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 📁 项目结构

```
src/
├── types/                  # 🏷️ 全局类型定义
├── adapters/              # 🔄 协议适配器
│   ├── base/              # 基础适配器抽象
│   ├── openai/            # OpenAI协议适配
│   ├── claude/            # Claude协议适配
│   └── gemini/            # Gemini原生接口
├── middleware/            # 🛠️ 中间件系统
├── services/              # ⚙️ 核心服务
│   ├── balancer/          # 负载均衡服务
│   ├── cache/             # 缓存服务
│   └── http/              # HTTP客户端
├── routes/                # 🛣️ API路由
├── database/              # 🗄️ 数据库层
├── utils/                 # 🔧 工具函数
└── index.ts               # 🚀 应用入口
```

## 🚀 快速开始

### 前提条件
- [Node.js](https://nodejs.org/) 18.0.0+
- [Cloudflare账户](https://dash.cloudflare.com/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- Google Gemini API密钥

### 安装和部署

```bash
# 克隆项目
git clone <repository-url>
cd gemini-code-api

# 安装依赖
npm install

# 构建项目
npm run build

# 部署到Cloudflare Workers
npm run deploy
```

**详细部署指南请参考**: [部署文档](./docs/DEPLOYMENT.md)

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

### Balancer使用场景

#### 单KEY场景
```bash
# 客户端只提供一个API密钥
Authorization: Bearer AIzaSy...

# 系统行为：跳过负载均衡计算，直接检查黑名单和配额状态
```

#### 多KEY场景
```bash
# 客户端提供多个API密钥（逗号分隔）
Authorization: Bearer AIzaSy...,AIzaSy...,AIzaSy...

# 系统行为：智能选择最优密钥，基于配额余量和黑名单状态
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

  // Claude -> Gemini
  'gpt-4': 'gemini-2.5-flash',
  'gpt-4o': 'gemini-2.5-pro',

  // Claude -> Gemini
  'claude-opus-4-20250514': 'gemini-2.5-pro',
  'claude-sonnet-4-20250514': 'gemini-2.5-flash',
  'claude-3-7-sonnet-20250219': 'gemini-2.5-flash',
  'claude-3-5-haiku-20241022': 'gemini-2.0-flash',
```

## 📊 监控和运维

### 健康检查
```bash
# 访问健康检查端点
curl https://your-worker.dev/health

# 查看实时日志
npm run logs
```

### 数据库管理
```bash
# 生成数据库迁移文件
npm run db:generate

# 执行数据库迁移
npm run db:migrate

# 查看数据库内容
wrangler d1 execute gemini-code --command="SELECT * FROM request_logs LIMIT 10"
```

**详细运维指南请参考**: [运维文档](./docs/OPERATIONS.md)

## 🔧 配置选项

### 速率限制
```typescript
// src/utils/constants.ts
export const FREE_TIER_LIMITS = {
  'gemini-2.5-pro': { rpm: 5, tpm: 250000, rpd: 100 },
  'gemini-2.5-flash': { rpm: 10, tpm: 250000, rpd: 250 },
  'gemini-2.0-flash': { rpm: 15, tpm: 1000000, rpd: 200 },
  'text-embedding-004': { rpm: 100, tpm: 1000000, rpd: 1000 },
} as const;
```

**完整配置说明请参考**: [配置文档](./docs/CONFIGURATION.md)

## 📚 详细文档

- [部署指南](./docs/DEPLOYMENT.md) - 完整的部署和配置说明
- [运维指南](./docs/OPERATIONS.md) - 监控、维护和故障排除
- [配置说明](./docs/CONFIGURATION.md) - 详细的配置选项和参数
- [存储架构](./docs/STORAGE_ARCHITECTURE.md) - 存储系统设计详解
- [API参考](./docs/API_REFERENCE.md) - 完整的API接口文档

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