const https = require('https');
const { URL } = require('url');
const config = require('./config.cjs');

// Claude测试请求
const claudeRequest = {
  model: 'claude-3-sonnet-20240229',
  max_tokens: 100,
  messages: [
    {
      role: 'user',
      content: 'Hello, how are you?'
    }
  ]
};

// 发送请求函数
function makeRequest(url, options) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = https;
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
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

// 测试Claude Messages API
async function testClaudeMessages() {
  console.log('=== Claude Messages API 调试测试 ===\n');
  
  console.log('发送的Claude请求:');
  console.log(JSON.stringify(claudeRequest, null, 2));
  console.log();
  
  try {
    const response = await makeRequest(`${config.API_BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(claudeRequest)
    });
    
    console.log(`响应状态码: ${response.statusCode}`);
    console.log('响应头:');
    console.log(JSON.stringify(response.headers, null, 2));
    console.log();
    
    console.log('响应体:');
    try {
      const responseBody = JSON.parse(response.body);
      console.log(JSON.stringify(responseBody, null, 2));
    } catch (e) {
      console.log('原始响应体:', response.body);
    }
    
  } catch (error) {
    console.error('请求失败:', error.message);
  }
}

// 运行测试
testClaudeMessages();