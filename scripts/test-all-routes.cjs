const https = require('https');
const http = require('http');
const { URL } = require('url');

// 配置
const BASE_URL = 'https://api.nkk.us.kg';
const VALID_API_KEY = 'AIzaSyDummy_Valid_Key_For_Testing_Routes_Only';

// 测试路由配置
const ROUTES_TO_TEST = [
  // 根路径和健康检查
  {
    name: '根路径 - API信息',
    method: 'GET',
    path: '/',
    expectedStatus: 200,
    headers: {},
    body: null
  },
  {
    name: '健康检查',
    method: 'GET', 
    path: '/health',
    expectedStatus: 200,
    headers: {},
    body: null
  },
  {
    name: '健康检查统计信息',
    method: 'GET',
    path: '/health/stats',
    expectedStatus: [200],
    headers: {},
    body: null
  },
  
  // V1 API路由 (OpenAI兼容)
  {
    name: 'OpenAI Chat Completions',
    method: 'POST',
    path: '/v1/chat/completions',
    expectedStatus: [200, 401, 400], // 可能的有效状态码
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VALID_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 10
    })
  },
  {
    name: 'OpenAI Chat Completions OPTIONS',
    method: 'OPTIONS',
    path: '/v1/chat/completions',
    expectedStatus: 204,
    headers: {},
    body: null
  },
  {
    name: 'OpenAI Embeddings',
    method: 'POST',
    path: '/v1/embeddings',
    expectedStatus: [200, 401, 400],
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VALID_API_KEY}`
    },
    body: JSON.stringify({
      model: 'text-embedding-ada-002',
      input: 'Hello world'
    })
  },
  {
    name: 'OpenAI Models',
    method: 'GET',
    path: '/v1/models',
    expectedStatus: 200,
    headers: {},
    body: null
  },
  {
    name: 'Claude Messages',
    method: 'POST',
    path: '/v1/messages',
    expectedStatus: [200, 401, 400],
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': VALID_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Hello' }]
    })
  },
  
  // V1Beta API路由 (Gemini原生)
  {
    name: 'Gemini Generate Content',
    method: 'POST',
    path: '/v1beta/models/gemini-pro:generateContent',
    expectedStatus: [200, 401, 400],
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': VALID_API_KEY
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: 'Hello' }]
      }],
      generationConfig: {
        maxOutputTokens: 10
      }
    })
  },
  {
    name: 'Gemini Models List',
    method: 'GET',
    path: '/v1beta/models',
    expectedStatus: 200,
    headers: {},
    body: null
  },
  
  // 404测试
  {
    name: '404 - 不存在的路由',
    method: 'GET',
    path: '/nonexistent/route',
    expectedStatus: 404,
    headers: {},
    body: null
  }
];

// HTTP请求函数
function makeRequest(url, options) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 30000
    };

    const req = client.request(requestOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

// 测试单个路由
async function testRoute(route) {
  console.log(`\n测试: ${route.name}`);
  console.log(`${route.method} ${route.path}`);
  
  try {
    const response = await makeRequest(`${BASE_URL}${route.path}`, {
      method: route.method,
      headers: route.headers,
      body: route.body
    });
    
    const expectedStatuses = Array.isArray(route.expectedStatus) 
      ? route.expectedStatus 
      : [route.expectedStatus];
    
    const isStatusValid = expectedStatuses.includes(response.statusCode);
    
    console.log(`状态码: ${response.statusCode}`);
    
    if (isStatusValid) {
      console.log(`✅ 状态码正确 (期望: ${expectedStatuses.join(' 或 ')})`);
    } else {
      console.log(`❌ 状态码错误 (期望: ${expectedStatuses.join(' 或 ')}, 实际: ${response.statusCode})`);
    }
    
    // 显示响应内容的前200个字符
    if (response.body) {
      const preview = response.body.length > 200 
        ? response.body.substring(0, 200) + '...' 
        : response.body;
      console.log(`响应预览: ${preview}`);
    }
    
    return {
      route: route.name,
      method: route.method,
      path: route.path,
      expectedStatus: expectedStatuses,
      actualStatus: response.statusCode,
      success: isStatusValid,
      responsePreview: response.body ? response.body.substring(0, 100) : null
    };
    
  } catch (error) {
    console.log(`❌ 请求失败: ${error.message}`);
    return {
      route: route.name,
      method: route.method,
      path: route.path,
      expectedStatus: route.expectedStatus,
      actualStatus: null,
      success: false,
      error: error.message
    };
  }
}

// 主测试函数
async function testAllRoutes() {
  console.log('=== 测试所有路由端点 ===');
  console.log(`基础URL: ${BASE_URL}`);
  console.log(`测试API Key: ${VALID_API_KEY}`);
  
  const results = [];
  
  for (const route of ROUTES_TO_TEST) {
    const result = await testRoute(route);
    results.push(result);
    
    // 在请求之间添加小延迟，避免过于频繁的请求
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // 汇总结果
  console.log('\n=== 测试结果汇总 ===');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`\n✅ 成功: ${successful.length}/${results.length}`);
  successful.forEach(r => {
    console.log(`  - ${r.route} (${r.method} ${r.path}) -> ${r.actualStatus}`);
  });
  
  if (failed.length > 0) {
    console.log(`\n❌ 失败: ${failed.length}/${results.length}`);
    failed.forEach(r => {
      console.log(`  - ${r.route} (${r.method} ${r.path})`);
      console.log(`    期望: ${Array.isArray(r.expectedStatus) ? r.expectedStatus.join('/') : r.expectedStatus}, 实际: ${r.actualStatus || '请求失败'}`);
      if (r.error) {
        console.log(`    错误: ${r.error}`);
      }
    });
  }
  
  console.log(`\n总体成功率: ${(successful.length / results.length * 100).toFixed(1)}%`);
  
  return results;
}

// 运行测试
if (require.main === module) {
  testAllRoutes().catch(console.error);
}

module.exports = { testAllRoutes, testRoute, ROUTES_TO_TEST };