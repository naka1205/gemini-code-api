#!/usr/bin/env node

/**
 * Gemini Code API Gateway 测试配置文件
 * 测试部署的API网关，该网关使用Gemini作为后端提供OpenAI/Claude/Gemini兼容接口
 */

module.exports = {
  // API Gateway 基础配置
  GATEWAY: {
    URL_BASE: 'https://xxx',
    // Gemini API密钥
    GEMINI_API_KEY: '',
  },

  // OpenAI兼容接口测试配置
  OPENAI_COMPAT: {
    ENDPOINT: '/v1/chat/completions',
    MODEL: 'gpt-4',
    MAX_TOKENS: 1000,
    TEMPERATURE: 0.7
  },

  // Claude兼容接口测试配置  
  CLAUDE_COMPAT: {
    ENDPOINT: '/v1/messages',
    MODEL: 'claude-3-5-haiku-20241022',
    MAX_TOKENS: 1000,
    VERSION: '2023-06-01'
  },

  // Gemini原生接口测试配置
  GEMINI_NATIVE: {
    ENDPOINT: '/v1beta/models/gemini-2.5-flash:generateContent',
    STREAM_ENDPOINT: '/v1beta/models/gemini-2.5-flash:streamGenerateContent',
    MODEL: 'gemini-2.5-flash',
    MAX_TOKENS: 1000,
    TEMPERATURE: 0.7
  },

  // 通用配置
  COMMON: {
    TIMEOUT: 30000,
    MAX_RETRIES: 3,
    REQUEST_DELAY: 1000,
    LOG_LEVEL: 'info'
  },

  // 网络代理配置（如需要）
  PROXY_CONFIG: {
    HTTP_PROXY: 'http://127.0.0.1:7897',
    HTTPS_PROXY: 'http://127.0.0.1:7897',
    ENABLED: false  // 默认关闭代理
  },

  // 测试数据
  TEST_PROMPTS: [
    "Hello, how are you?",
    "What is the capital of France?", 
    "Explain quantum computing in simple terms.",
    "Write a short poem about nature."
  ],

  // 健康检查配置
  HEALTH_CHECK: {
    ENDPOINT: '/health'
  }
};