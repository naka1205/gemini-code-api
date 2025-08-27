# 运维指南

> Gemini Code API 的监控、维护和故障排除指南

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
