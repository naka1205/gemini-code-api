# 运维指南

> Gemini Code API 的监控、维护和故障排除指南

## 📊 监控和运维

### 本地调试（含日志连接与代码验证）

执行的步骤：

1) 设置网络代理（可选，但国内/受限网络强烈建议）

```powershell
# Windows PowerShell（当前会话）
$env:HTTP_PROXY = "http://127.0.0.1:7890"
$env:HTTPS_PROXY = "http://127.0.0.1:7890"
# 快速连通性检查
curl https://workers.cloudflare.com | Select-Object -First 1
```

```bash
# macOS/Linux（当前会话）
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890
curl -I https://workers.cloudflare.com
```

2) 启动日志尾随（tail）并落地到文件

```powershell
# 支持格式：json / pretty（推荐 json 便于检索）
npx wrangler tail --format json | Tee-Object -FilePath logs/workers.tail.json
```

```bash
# macOS/Linux
npx wrangler tail --format json | tee logs/workers.tail.json
```

常见筛选命令（PowerShell）：

```powershell
# 最新 100 行
Get-Content logs/workers.tail.json -Tail 100
# 仅看错误/警告
Get-Content logs/workers.tail.json | Select-String -Pattern '"level":"error"|"level":"warn"'
# 按请求ID筛选（替换为真实ID）
Get-Content logs/workers.tail.json | Select-String 0123456789abcdef
```

3) 端到端验证（按端点执行并在 tail 与 D1 中核对数据）

- 运行测试脚本（示例，需设置 API_BASE 与 API_KEY）：

```bash
node scripts/test-claude-debug.cjs
node scripts/test-claude-stream.cjs
node scripts/test-openai-nonstream.cjs
node scripts/test-openai-stream.cjs
node scripts/test-openai-embeddings.cjs
```

- 数据库字段校验（D1 查询示例）：

```bash
# 按端点检查最近记录，关注 original_model/client_ip/user_agent/request_size/response_size/total_tokens/is_stream/status_code/has_error
wrangler d1 execute gemini-code --command="SELECT * FROM request_logs WHERE endpoint = '/v1/messages' ORDER BY timestamp DESC LIMIT 5"
wrangler d1 execute gemini-code --command="SELECT * FROM request_logs WHERE endpoint = '/v1/chat/completions' ORDER BY timestamp DESC LIMIT 5"
wrangler d1 execute gemini-code --command="SELECT * FROM request_logs WHERE endpoint = '/v1/embeddings' ORDER BY timestamp DESC LIMIT 5"
```

4) 排错建议（与工作流一致）

- 流式记录缺失：检查 `ReadableStream.tee()` 两支统计与 `waitUntil` 调用时机；确保 reader 循环能进入 `finally`。
- 字段为 `null/0`：检查路由是否正确传入 `context`；确认 `QuotaManager.recordUsage` 绑定项与 schema 一致。
- 清理历史占位记录（可选）：

```bash
wrangler d1 execute gemini-code --command="DELETE FROM request_logs WHERE is_stream=1 AND request_size=0 AND response_size=0 AND total_tokens=0"
```

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
# 生成数据库迁移文件（基于schema.ts自动生成）
npm run db:generate

# 重置数据库（谨慎使用）
npm run db:reset

# 查看数据库内容（使用wrangler直接访问D1）
wrangler d1 execute gemini-code --command="SELECT * FROM request_logs LIMIT 10"

# 备份数据库
npm run db:backup

# 恢复数据库
npm run db:restore backup-file.sql

# 查看数据库内容
wrangler d1 execute gemini-code --command="SELECT * FROM request_logs LIMIT 10"

# 查看API密钥指标
wrangler d1 execute gemini-code --command="SELECT * FROM api_key_metrics LIMIT 10"

# 查看系统统计
wrangler d1 execute gemini-code --command="SELECT * FROM system_stats ORDER BY date DESC LIMIT 7"

# 查看错误日志
wrangler d1 execute gemini-code --command="SELECT * FROM error_logs ORDER BY timestamp DESC LIMIT 10"

# 实时监控数据库状态
wrangler d1 execute gemini-code --command="SELECT 'request_logs' as table_name, COUNT(*) as count FROM request_logs UNION ALL SELECT 'api_key_metrics', COUNT(*) FROM api_key_metrics UNION ALL SELECT 'system_stats', COUNT(*) FROM system_stats UNION ALL SELECT 'error_logs', COUNT(*) FROM error_logs"
```

## ⚠️ 重要注意事项

### 日志与网络代理（先设代理再连接日志）

在国内或受限网络环境中，连接 Cloudflare 日志服务前应先设置系统或会话级网络代理，否则可能出现连接失败或超时。

- Windows PowerShell（当前会话）
```powershell
$env:HTTP_PROXY = "http://127.0.0.1:7890"
$env:HTTPS_PROXY = "http://127.0.0.1:7890"
# 验证网络
curl https://workers.cloudflare.com | Select-Object -First 1

# 连接日志（json 或 pretty 二选一，建议 json 便于检索）
npx wrangler tail --format json | Tee-Object -FilePath logs/workers.tail.json
```

- macOS/Linux（当前会话）
```bash
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890
# 验证网络
curl -I https://workers.cloudflare.com

# 连接日志（json 或 pretty 二选一）
npx wrangler tail --format json | tee logs/workers.tail.json
```

说明：wrangler 支持的格式仅 `json` 与 `pretty`，不支持 `ndjson`。

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

## 🔧 运维工具和脚本

### 健康检查脚本

```bash
#!/bin/bash
# health-check.sh

WORKER_URL="https://your-worker.dev"
HEALTH_ENDPOINT="$WORKER_URL/health"

echo "🔍 检查 Gemini Code API 健康状态..."
echo "URL: $HEALTH_ENDPOINT"

# 健康检查
HEALTH_RESPONSE=$(curl -s "$HEALTH_ENDPOINT")
HEALTH_STATUS=$(echo "$HEALTH_RESPONSE" | jq -r '.status')

if [ "$HEALTH_STATUS" = "healthy" ]; then
    echo "✅ 服务状态: $HEALTH_STATUS"
    
    # 显示关键指标
    echo "📊 关键指标:"
    echo "$HEALTH_RESPONSE" | jq -r '.metrics | "   - 总请求数: \(.requests_total)"'
    echo "$HEALTH_RESPONSE" | jq -r '.metrics | "   - 平均响应时间: \(.average_response_time)ms"'
    echo "$HEALTH_RESPONSE" | jq -r '.metrics | "   - 错误率: \(.error_rate * 100)%"'
    echo "$HEALTH_RESPONSE" | jq -r '.metrics | "   - 活跃API密钥: \(.active_api_keys)"'
    
    # 数据库状态
    DB_STATUS=$(echo "$HEALTH_RESPONSE" | jq -r '.database.status')
    echo "🗄️ 数据库状态: $DB_STATUS"
    
else
    echo "❌ 服务状态异常: $HEALTH_STATUS"
    echo "响应内容: $HEALTH_RESPONSE"
    exit 1
fi
```

### 数据库监控脚本

```bash
#!/bin/bash
# db-monitor.sh

echo "🗄️ 数据库状态监控..."

# 检查各表数据量
echo "📊 数据表统计:"
wrangler d1 execute gemini-code --command="
SELECT 
    'request_logs' as table_name, 
    COUNT(*) as count,
    MAX(timestamp) as latest_record
FROM request_logs 
UNION ALL 
SELECT 
    'api_key_metrics', 
    COUNT(*), 
    MAX(updated_at)
FROM api_key_metrics 
UNION ALL 
SELECT 
    'system_stats', 
    COUNT(*), 
    MAX(updated_at)
FROM system_stats 
UNION ALL 
SELECT 
    'error_logs', 
    COUNT(*), 
    MAX(timestamp)
FROM error_logs
ORDER BY table_name;"

echo ""
echo "🔑 API密钥性能排名:"
wrangler d1 execute gemini-code --command="
SELECT 
    key_hash,
    total_requests,
    successful_requests,
    ROUND(average_response_time, 2) as avg_response_ms,
    ROUND(CAST(successful_requests AS FLOAT) / total_requests * 100, 2) as success_rate
FROM api_key_metrics 
WHERE total_requests > 0
ORDER BY total_requests DESC 
LIMIT 10;"
```

### 性能分析脚本

```bash
#!/bin/bash
# performance-analysis.sh

echo "📈 性能分析报告..."

# 最近24小时的请求统计
echo "🕐 最近24小时请求统计:"
wrangler d1 execute gemini-code --command="
SELECT 
    strftime('%H:00', datetime(timestamp, 'unixepoch')) as hour,
    COUNT(*) as requests,
    ROUND(AVG(response_time), 2) as avg_response_ms,
    SUM(CASE WHEN has_error = 1 THEN 1 ELSE 0 END) as errors,
    ROUND(SUM(CASE WHEN has_error = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as error_rate
FROM request_logs 
WHERE timestamp >= strftime('%s', 'now', '-1 day')
GROUP BY strftime('%H:00', datetime(timestamp, 'unixepoch'))
ORDER BY hour;"

echo ""
echo "📊 模型使用统计:"
wrangler d1 execute gemini-code --command="
SELECT 
    model,
    COUNT(*) as requests,
    ROUND(AVG(response_time), 2) as avg_response_ms,
    SUM(total_tokens) as total_tokens,
    ROUND(AVG(total_tokens), 2) as avg_tokens_per_request
FROM request_logs 
WHERE timestamp >= strftime('%s', 'now', '-1 day')
GROUP BY model
ORDER BY requests DESC;"
```

## 📋 定期维护任务

### 每日任务

- [ ] 检查健康状态端点
- [ ] 查看错误日志
- [ ] 监控API密钥性能
- [ ] 检查数据库连接状态

### 每周任务

- [ ] 分析性能趋势
- [ ] 检查缓存命中率
- [ ] 清理过期日志数据
- [ ] 备份重要数据

### 每月任务

- [ ] 性能优化评估
- [ ] 安全配置检查
- [ ] 容量规划
- [ ] 更新依赖包

## 🚨 紧急响应流程

### 服务不可用

1. **立即检查**
   ```bash
   # 检查健康状态
   curl https://your-worker.dev/health
   
   # 查看实时日志
   npm run logs
   
   # 检查Cloudflare状态页面
   ```

2. **快速诊断**
   - 检查数据库连接
   - 验证Worker部署状态
   - 检查API密钥状态

3. **应急措施**
   - 重启Worker服务
   - 回滚到稳定版本
   - 启用备用服务

### 性能下降

1. **性能分析**
   ```bash
   # 查看响应时间趋势
   wrangler d1 execute gemini-code --command="
   SELECT 
       strftime('%Y-%m-%d %H:00', datetime(timestamp, 'unixepoch')) as time,
       AVG(response_time) as avg_response_ms,
       COUNT(*) as requests
   FROM request_logs 
   WHERE timestamp >= strftime('%s', 'now', '-3 days')
   GROUP BY strftime('%Y-%m-%d %H:00', datetime(timestamp, 'unixepoch'))
   ORDER BY time DESC;"
   ```

2. **优化措施**
   - 调整缓存配置
   - 优化数据库查询
   - 检查API密钥配额

## 📚 相关文档

- [部署指南](./DEPLOYMENT.md) - 完整的部署和配置说明
- [配置说明](./CONFIGURATION.md) - 详细的配置选项和参数
- [存储架构](./STORAGE_ARCHITECTURE.md) - 存储系统设计详解
- [API参考](./API_REFERENCE.md) - 完整的API接口文档

## 🆘 获取帮助

如果遇到运维问题，请：

1. 检查 [故障排除](#故障排除) 部分
2. 查看 [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
3. 提交 [GitHub Issue](https://github.com/your-repo/issues)
4. 加入 [GitHub Discussions](https://github.com/your-repo/discussions)
