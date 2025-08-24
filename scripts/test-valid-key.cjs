const https = require('https');
const http = require('http');
const config = require('./config.cjs');

// 配置
const BASE_URL = config.API_BASE;
const VALID_GEMINI_KEY = config.API_KEY;

// 测试配置
const tests = [
  {
    name: 'OpenAI Chat Completions - 有效密钥',
    method: 'POST',
    path: '/v1/chat/completions',
    headers: {
      'Authorization': `Bearer ${VALID_GEMINI_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'user', content: 'Hello, this is a test message.' }
      ],
      max_tokens: 50
    }),
    expectedStatus: [200, 400, 401, 429] // 可能的正常响应状态
  },
  {
    name: 'OpenAI Embeddings - 有效密钥',
    method: 'POST',
    path: '/v1/embeddings',
    headers: {
      'Authorization': `Bearer ${VALID_GEMINI_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'text-embedding-ada-002',
      input: 'This is a test text for embedding.'
    }),
    expectedStatus: [200, 400, 401, 429]
  },
  {
    name: 'Claude Messages - 有效密钥',
    method: 'POST',
    path: '/v1/messages',
    headers: {
      'x-api-key': VALID_GEMINI_KEY,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 50,
      messages: [
        { role: 'user', content: 'Hello, this is a test message.' }
      ]
    }),
    expectedStatus: [200, 400, 401, 429]
  },
  {
    name: 'Gemini Generate Content - 有效密钥',
    method: 'POST',
    path: '/v1beta/models/gemini-2.5-pro:generateContent',
    headers: {
      'x-goog-api-key': VALID_GEMINI_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: 'Hello, this is a test message.'
        }]
      }],
      generationConfig: {
        maxOutputTokens: 50
      }
    }),
    expectedStatus: [200, 400, 401, 429]
  }
];

// HTTP请求函数
function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(options.url);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const requestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method,
      headers: options.headers || {}
    };

    const req = client.request(requestOptions, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(responseData);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: jsonData
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: responseData
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(data);
    }
    
    req.end();
  });
}

// 运行测试
async function runTests() {
  console.log('=== 使用有效API密钥测试路由功能 ===\n');
  console.log(`测试地址: ${BASE_URL}`);
  console.log(`API密钥: ${VALID_GEMINI_KEY.substring(0, 10)}...\n`);
  
  const results = [];
  
  for (const test of tests) {
    console.log(`测试: ${test.name}`);
    console.log(`${test.method} ${test.path}`);
    
    try {
      const response = await makeRequest({
        url: `${BASE_URL}${test.path}`,
        method: test.method,
        headers: test.headers
      }, test.body);
      
      console.log(`状态码: ${response.status}`);
      
      const isExpectedStatus = Array.isArray(test.expectedStatus) 
        ? test.expectedStatus.includes(response.status)
        : response.status === test.expectedStatus;
      
      if (isExpectedStatus) {
        console.log('✅ 状态码正确 (期望:', test.expectedStatus, ')');
        results.push({ test: test.name, status: 'success', code: response.status });
      } else {
        console.log('❌ 状态码错误 (期望:', test.expectedStatus, ', 实际:', response.status, ')');
        results.push({ test: test.name, status: 'failed', code: response.status });
      }
      
      // 显示响应预览
      const preview = typeof response.data === 'string' 
        ? response.data.substring(0, 100)
        : JSON.stringify(response.data).substring(0, 100);
      console.log('响应预览:', preview);
      
      // 检查是否有错误信息
      if (response.data && typeof response.data === 'object') {
        if (response.data.error) {
          console.log('错误信息:', response.data.error.message || response.data.error);
        }
        if (response.data.requestId) {
          console.log('请求ID:', response.data.requestId);
        }
      }
      
    } catch (error) {
      console.log('❌ 请求失败:', error.message);
      results.push({ test: test.name, status: 'error', error: error.message });
    }
    
    console.log('');
  }
  
  // 汇总结果
  console.log('=== 测试结果汇总 ===\n');
  
  const successful = results.filter(r => r.status === 'success');
  const failed = results.filter(r => r.status === 'failed');
  const errors = results.filter(r => r.status === 'error');
  
  if (successful.length > 0) {
    console.log(`✅ 成功: ${successful.length}/${results.length}`);
    successful.forEach(r => {
      console.log(`  - ${r.test} -> ${r.code}`);
    });
    console.log('');
  }
  
  if (failed.length > 0) {
    console.log(`❌ 失败: ${failed.length}/${results.length}`);
    failed.forEach(r => {
      console.log(`  - ${r.test}`);
      console.log(`    期望: 200/400/401/429, 实际: ${r.code}`);
    });
    console.log('');
  }
  
  if (errors.length > 0) {
    console.log(`🔥 错误: ${errors.length}/${results.length}`);
    errors.forEach(r => {
      console.log(`  - ${r.test}`);
      console.log(`    错误: ${r.error}`);
    });
    console.log('');
  }
  
  const successRate = (successful.length / results.length * 100).toFixed(1);
  console.log(`总体成功率: ${successRate}%`);
  
  console.log('\n=== 注意事项 ===');
  console.log('1. 请确保已将 VALID_GEMINI_KEY 替换为您的真实API密钥');
  console.log('2. 状态码200表示成功调用，400/401/429表示正常的API限制或错误');
  console.log('3. 请同时查看 wrangler tail 日志以验证请求是否到达内部方法');
}

runTests().catch(console.error);