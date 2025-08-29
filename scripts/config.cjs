#!/usr/bin/env node

/**
 * 测试配置文件
 */

module.exports = {
  // API基础配置

  API_KEY: '',
  API_BASE: 'https://api.nkk.us.kg',
  // 测试配置
  TIMEOUT: 30000,
  MAX_RETRIES: 3,
  
  // 数据库配置
  DATABASE_NAME: 'gemini-code',
  
  // 日志配置
  LOG_LEVEL:  'info',
  
  // 网络代理配置（Windows PowerShell）
  PROXY_CONFIG: {
    HTTP_PROXY: 'http://127.0.0.1:7897',
    HTTPS_PROXY: 'http://127.0.0.1:7897'
  }
};