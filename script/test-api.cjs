#!/usr/bin/env node

/**
 * Gemini Code API 测试脚本
 * 系统化测试各种API端点和场景
 */

const API_BASE_URL = 'https://xxxx';
const TEST_API_KEY = 'xxxx';

/**
 * HTTP 请求帮助函数
 */
async function makeRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const config = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'gemini-code-api-test/1.0.0',
      ...options.headers
    },
    ...options
  };

  console.log(`\n🔄 Testing: ${config.method} ${url}`);
  console.log(`📋 Headers:`, JSON.stringify(config.headers, null, 2));
  if (config.body) {
    console.log(`📦 Body:`, config.body);
  }

  try {
    const response = await fetch(url, config);
    const responseText = await response.text();
    
    console.log(`📊 Status: ${response.status} ${response.statusText}`);
    console.log(`📄 Response Headers:`, JSON.stringify(Object.fromEntries(response.headers), null, 2));
    
    // 尝试解析JSON
    let responseData;
    try {
      responseData = JSON.parse(responseText);
      console.log(`✅ Response JSON:`, JSON.stringify(responseData, null, 2));
    } catch (e) {
      console.log(`⚠️  Response Text:`, responseText);
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers),
      data: responseData || responseText
    };
  } catch (error) {
    console.error(`❌ Request failed:`, error.message);
    return {
      ok: false,
      error: error.message
    };
  }
}

/**
 * 测试用例定义
 */
const testCases = [
  {
    name: 'Health Check',
    endpoint: '/health',
    method: 'GET'
  },
  {
    name: 'Root Info',
    endpoint: '/',
    method: 'GET'
  },
  {
    name: 'Gemini Models List',
    endpoint: '/v1beta/models',
    method: 'GET',
    headers: {
      'x-goog-api-key': TEST_API_KEY
    }
  },
  {
    name: 'Gemini Generate Content',
    endpoint: '/v1beta/models/gemini-2.5-flash:generateContent',
    method: 'POST',
    headers: {
      'x-goog-api-key': TEST_API_KEY
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: "Hello, please respond with a simple greeting."
        }]
      }]
    })
  },
  {
    name: 'Gemini Stream Generate Content',
    endpoint: '/v1beta/models/gemini-2.5-flash:streamGenerateContent',
    method: 'POST',
    headers: {
      'x-goog-api-key': TEST_API_KEY
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: "Hello, please respond with a simple greeting."
        }]
      }]
    })
  },
  {
    name: 'OpenAI Compatible Chat',
    endpoint: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TEST_API_KEY}`
    },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [{
        role: "user",
        content: "Hello, please respond with a simple greeting."
      }]
    })
  },
  {
    name: 'Claude Compatible Messages',
    endpoint: '/v1/messages',
    method: 'POST',
    headers: {
      'x-api-key': TEST_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      max_tokens: 100,
      messages: [{
        role: "user",
        content: "Hello, please respond with a simple greeting."
      }]
    })
  },
  {
    name: 'Invalid Endpoint (404 Test)',
    endpoint: '/invalid/endpoint',
    method: 'GET'
  }
];

/**
 * 运行测试套件
 */
async function runTests() {
  console.log('🚀 Starting Gemini Code API Test Suite');
  console.log(`🌐 Base URL: ${API_BASE_URL}`);
  console.log(`🔑 API Key: ${TEST_API_KEY.substring(0, 10)}...`);
  console.log('=' .repeat(80));

  const results = [];

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`\n📋 Test ${i + 1}/${testCases.length}: ${testCase.name}`);
    console.log('-'.repeat(60));

    const result = await makeRequest(testCase.endpoint, {
      method: testCase.method,
      headers: testCase.headers,
      body: testCase.body
    });

    results.push({
      name: testCase.name,
      ...result
    });

    // 小延迟避免请求过快
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 测试结果汇总
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(80));

  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;

  results.forEach((result, index) => {
    const status = result.ok ? '✅ PASS' : '❌ FAIL';
    const statusCode = result.status ? `[${result.status}]` : '[ERROR]';
    console.log(`${status} ${statusCode} ${result.name}`);
    if (!result.ok && result.error) {
      console.log(`    Error: ${result.error}`);
    }
  });

  console.log(`\n📈 Summary: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    console.log('\n🔍 Failed tests details:');
    results.filter(r => !r.ok).forEach(result => {
      console.log(`\n❌ ${result.name}:`);
      if (result.status) {
        console.log(`   Status: ${result.status} ${result.statusText}`);
        if (result.data && typeof result.data === 'object') {
          console.log(`   Response:`, JSON.stringify(result.data, null, 4));
        } else if (result.data) {
          console.log(`   Response: ${result.data}`);
        }
      }
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });
  }

  process.exit(failed > 0 ? 1 : 0);
}

// 运行测试
if (require.main === module) {
  runTests().catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
}

module.exports = { makeRequest, runTests };