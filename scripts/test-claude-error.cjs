const https = require('https');
const { URL } = require('url');
const config = require('./config.cjs');

// 测试可能导致错误的Claude请求格式
const problematicRequests = [
  {
    name: '包含复杂content数组的请求',
    request: {
      model: 'claude-3-sonnet-20240229',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Hello, how are you?'
            }
          ]
        }
      ]
    }
  },
  {
    name: '包含系统提示的请求',
    request: {
      model: 'claude-3-sonnet-20240229',
      max_tokens: 100,
      system: 'You are a helpful assistant.',
      messages: [
        {
          role: 'user',
          content: 'Hello'
        }
      ]
    }
  },
  {
    name: '包含多轮对话的请求',
    request: {
      model: 'claude-3-sonnet-20240229',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: 'Hello'
        },
        {
          role: 'assistant',
          content: 'Hi there!'
        },
        {
          role: 'user',
          content: 'How are you?'
        }
      ]
    }
  },
  {
    name: '包含空content的请求',
    request: {
      model: 'claude-3-sonnet-20240229',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: ''
        }
      ]
    }
  }
];

// 发送请求函数
function makeRequest(url, options) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 30000
    };

    const req = https.request(requestOptions, (res) => {
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
    
    req.on('error', (err) => {
      reject(err);
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

// 测试所有可能导致错误的请求
async function testProblematicRequests() {
  console.log('=== Claude Messages API 错误重现测试 ===\n');
  
  for (const testCase of problematicRequests) {
    console.log(`\n--- 测试: ${testCase.name} ---`);
    console.log('请求内容:');
    console.log(JSON.stringify(testCase.request, null, 2));
    console.log();
    
    try {
      const response = await makeRequest(`${config.API_BASE}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(testCase.request)
      });
      
      console.log(`响应状态码: ${response.statusCode}`);
      
      if (response.statusCode !== 200) {
        console.log('❌ 错误响应:');
        try {
          const errorBody = JSON.parse(response.body);
          console.log(JSON.stringify(errorBody, null, 2));
        } catch (e) {
          console.log('原始错误响应:', response.body);
        }
      } else {
        console.log('✅ 请求成功');
        try {
          const responseBody = JSON.parse(response.body);
          console.log('响应预览:', responseBody.content?.[0]?.text?.substring(0, 50) + '...');
        } catch (e) {
          console.log('响应解析失败');
        }
      }
      
    } catch (error) {
      console.error('❌ 请求失败:', error.message);
    }
    
    console.log('\n' + '='.repeat(50));
  }
}

// 运行测试
testProblematicRequests();