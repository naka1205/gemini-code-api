-- 创建请求日志表，用于配额管理和统计
CREATE TABLE IF NOT EXISTS request_logs (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  api_key_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  status_code INTEGER NOT NULL DEFAULT 200,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 为查询性能创建索引
CREATE INDEX IF NOT EXISTS idx_request_logs_key_model_time 
  ON request_logs(api_key_hash, model, timestamp);

CREATE INDEX IF NOT EXISTS idx_request_logs_timestamp 
  ON request_logs(timestamp);

-- 创建黑名单表（如果需要持久化黑名单）
CREATE TABLE IF NOT EXISTS api_key_blacklist (
  key_hash TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  expires_at INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 为黑名单过期查询创建索引
CREATE INDEX IF NOT EXISTS idx_blacklist_expires 
  ON api_key_blacklist(expires_at);

-- 插入测试数据（可选）
-- INSERT INTO request_logs (id, timestamp, api_key_hash, model, input_tokens, output_tokens, total_tokens, status_code)
-- VALUES ('test-1', strftime('%s', 'now'), 'test-key-hash', 'gemini-pro', 100, 200, 300, 200);