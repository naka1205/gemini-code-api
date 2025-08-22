# 🚀 Gemini Code API 部署指南

这是一个简化的快速部署指南，帮助您在10分钟内完成项目部署。

## 📋 部署前检查清单

- [ ] Node.js 18.0.0+ 已安装
- [ ] Cloudflare 账户已创建
- [ ] 拥有有效的 Gemini API 密钥
- [ ] Git 已安装

## 🎯 快速部署（10分钟）

### 步骤 1: 环境准备（2分钟）

```bash
# 安装 Wrangler CLI
npm install -g wrangler

# 登录 Cloudflare
wrangler login
# 在浏览器中完成授权
```

### 步骤 2: 获取项目（1分钟）

```bash
# 下载项目
git clone <your-repository-url>
cd gemini-code-api

# 安装依赖
npm install
```

### 步骤 3: 数据库设置（3分钟）

```bash
# 创建数据库
npm run db:create

# 复制输出的 database_id
# 示例输出: Created database gemini-code with ID: 12345678-1234-1234-1234-123456789012
```

编辑 `wrangler.toml` 文件，更新数据库ID：

```toml
[[d1_databases]]
binding = "DB"
database_name = "gemini-code"
database_id = "12345678-1234-1234-1234-123456789012"  # 替换为您的实际ID
```

```bash
# 执行数据库迁移
npm run db:migrate
```

### 步骤 4: 部署项目（2分钟）

```bash
# 构建项目
npm run build

# 部署到 Cloudflare Workers
npm run deploy
```

### 步骤 5: 验证部署（2分钟）

```bash
# 健康检查（替换为您的实际域名）
curl https://gemini-code-api.your-subdomain.workers.dev/health

# 测试 API（替换为您的 Gemini API 密钥）
curl -X POST https://gemini-code-api.your-subdomain.workers.dev/v1/chat/completions \
  -H "Authorization: Bearer YOUR_GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## 🔧 常见问题解决

### 问题 1: 数据库连接失败

```bash
Error: D1_ERROR: Database not found
```

**解决方案：**
1. 检查 `wrangler.toml` 中的 `database_id` 是否正确
2. 确认数据库已创建：`wrangler d1 list`
3. 重新执行迁移：`npm run db:migrate`

### 问题 2: 部署权限错误

```bash
Error: Authentication error
```

**解决方案：**
1. 重新登录：`wrangler logout && wrangler login`
2. 检查 Cloudflare 账户权限
3. 确认账户已激活 Workers 服务

### 问题 3: API 密钥验证失败

```bash
Error: Invalid Gemini API key format
```

**解决方案：**
1. 确认 Gemini API 密钥格式正确（以 `AIza` 开头）
2. 检查密钥是否有效且未过期
3. 确认密钥有访问相关模型的权限

## 📊 部署后配置

### 自定义域名（可选）

```bash
# 绑定自定义域名
wrangler route publish --custom-domain your-domain.com
```

### 环境变量配置（如需要）

编辑 `wrangler.toml`:

```toml
[vars]
CUSTOM_SETTING = "value"
```

### 访问控制（推荐）

考虑配置 Cloudflare Access 进行访问控制：

1. 访问 Cloudflare Dashboard
2. 进入 Zero Trust > Access > Applications
3. 创建新的应用保护规则

## 🔍 监控和维护

### 查看实时日志

```bash
# 实时日志
npm run logs

# 过滤错误日志
wrangler tail --format pretty | grep ERROR
```

### 数据库维护

```bash
# 查看数据库状态
wrangler d1 info gemini-code

# 查看请求日志
wrangler d1 execute gemini-code --command="SELECT * FROM request_logs ORDER BY timestamp DESC LIMIT 10"

# 数据库备份
wrangler d1 export gemini-code --output backup-$(date +%Y%m%d).sql
```

### 性能监控

定期检查 `/health` 端点：

```bash
# 健康检查
curl https://your-worker.dev/health | jq

# 关键指标
curl https://your-worker.dev/health | jq '.metrics'
```

## 🚨 紧急故障处理

### 快速回滚

```bash
# 查看部署历史
wrangler deployments list

# 回滚到上一版本
wrangler rollback [deployment-id]
```

### 重置数据库

```bash
# ⚠️ 危险操作：重置所有数据
npm run db:reset
```

### 重新部署

```bash
# 强制重新部署
npm run deploy:force
```

## 📞 获取帮助

如果遇到问题：

1. **检查日志**: `npm run logs`
2. **查看文档**: [完整文档](./README.md)
3. **提交 Issue**: [GitHub Issues](https://github.com/your-repo/issues)
4. **社区讨论**: [GitHub Discussions](https://github.com/your-repo/discussions)

## ✅ 部署完成检查清单

- [ ] 健康检查端点正常响应
- [ ] OpenAI 兼容接口测试通过
- [ ] Claude 兼容接口测试通过
- [ ] Gemini 原生接口测试通过
- [ ] 数据库连接正常
- [ ] 日志记录正常工作
- [ ] 负载均衡功能正常

恭喜！您的 Gemini Code API 已成功部署并运行。🎉

---

📖 **更多详细信息请参考 [完整文档](./README.md)**