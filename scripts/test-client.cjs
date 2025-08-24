// 客户端兼容性测试脚本

const config = require('./config.cjs');

const API_URL = config.API_BASE;
const API_KEY = config.API_KEY;

// 测试基本的 OpenAI 请求
async function testBasicOpenAI() {
  console.log('=== 测试基本 OpenAI 请求 ===\n');
  
  try {
    const response = await fetch(`${API_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'user', content: 'Say hello' }
        ],
        temperature: 0.7,
        max_tokens: 50
      })
    });
    
    console.log('Status:', response.status);
    console.log('Headers:', Object.fromEntries(response.headers.entries()));
    
    const text = await response.text();
    console.log('Response:', text);
    
    try {
      const data = JSON.parse(text);
      console.log('Parsed response:', JSON.stringify(data, null, 2));
    } catch (e) {
      console.log('Raw response (not JSON):', text);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// 测试没有正确 API KEY 的情况
async function testNoApiKey() {
  console.log('\n=== 测试无 API KEY ===\n');
  
  try {
    const response = await fetch(`${API_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'user', content: 'Test' }
        ]
      })
    });
    
    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

// 测试流式响应（带超时）
async function testStreamWithTimeout() {
  console.log('\n=== 测试流式响应（5秒超时）===\n');
  
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
    console.log('Request aborted due to timeout');
  }, 5000);
  
  try {
    const response = await fetch(`${API_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'user', content: 'Count from 1 to 3' }
        ],
        stream: true,
        max_tokens: 50
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    console.log('Status:', response.status);
    console.log('Content-Type:', response.headers.get('content-type'));
    
    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let chunkCount = 0;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunkCount++;
        const chunk = decoder.decode(value, { stream: true });
        console.log(`Chunk ${chunkCount}:`, chunk.substring(0, 100));
        buffer += chunk;
        
        // 处理前3个数据块就停止
        if (chunkCount >= 3) {
          console.log('Stopping after 3 chunks...');
          reader.cancel();
          break;
        }
      }
      
      console.log('Total chunks received:', chunkCount);
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('Request was aborted');
    } else {
      console.error('Error:', error);
    }
  }
}

// 测试错误的模型名称
async function testInvalidModel() {
  console.log('\n=== 测试无效模型名称 ===\n');
  
  try {
    const response = await fetch(`${API_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'invalid-model-xyz',
        messages: [
          { role: 'user', content: 'Test' }
        ]
      })
    });
    
    console.log('Status:', response.status);
    const text = await response.text();
    console.log('Response:', text);
  } catch (error) {
    console.error('Error:', error);
  }
}

// 检查 Worker 日志（使用 tail 命令）
async function checkWorkerLogs() {
  console.log('\n=== 提示：查看 Worker 日志 ===\n');
  console.log('运行以下命令查看实时日志：');
  console.log('npx wrangler tail gemini-code-api');
}

// 运行所有测试
async function runTests() {
  console.log('开始客户端兼容性测试...\n');
  console.log('API URL:', API_URL);
  console.log('========================================\n');
  
  await testBasicOpenAI();
  await testNoApiKey();
  await testStreamWithTimeout();
  await testInvalidModel();
  
  checkWorkerLogs();
  
  console.log('\n=== 测试完成 ===');
}

// 执行测试
runTests().catch(console.error);