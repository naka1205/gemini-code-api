// 真实 API 调用测试脚本

const config = require('./config.cjs');

const API_URL = config.API_BASE;
const GEMINI_API_KEY = config.API_KEY;

// 测试 OpenAI 格式
async function testOpenAIFormat() {
  console.log('=== 测试 OpenAI 格式 API ===\n');
  
  try {
    const response = await fetch(`${API_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GEMINI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'What is the capital of France? Answer in one word.' }
        ],
        max_tokens: 50,
        temperature: 0.7
      })
    });
    
    console.log('状态码:', response.status);
    console.log('响应头 x-request-id:', response.headers.get('x-request-id'));
    
    const data = await response.json();
    console.log('响应数据:', JSON.stringify(data, null, 2));
    
    if (data.choices && data.choices[0]) {
      console.log('\n助手回复:', data.choices[0].message.content);
    }
  } catch (error) {
    console.error('OpenAI 格式测试失败:', error);
  }
}

// 测试流式响应
async function testStreamingResponse() {
  console.log('\n=== 测试流式响应 ===\n');
  
  try {
    const response = await fetch(`${API_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GEMINI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'user', content: 'Count from 1 to 5 slowly.' }
        ],
        max_tokens: 100,
        stream: true
      })
    });
    
    console.log('状态码:', response.status);
    console.log('Content-Type:', response.headers.get('content-type'));
    
    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              console.log('\n流结束');
              break;
            }
            try {
              const chunk = JSON.parse(data);
              if (chunk.choices && chunk.choices[0].delta.content) {
                process.stdout.write(chunk.choices[0].delta.content);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('流式响应测试失败:', error);
  }
}

// 测试 Claude 格式
async function testClaudeFormat() {
  console.log('\n\n=== 测试 Claude 格式 API ===\n');
  
  try {
    const response = await fetch(`${API_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': GEMINI_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 100,
        messages: [
          { role: 'user', content: 'What is 2+2? Answer with just the number.' }
        ]
      })
    });
    
    console.log('状态码:', response.status);
    
    const data = await response.json();
    console.log('响应数据:', JSON.stringify(data, null, 2));
    
    if (data.content && data.content[0]) {
      console.log('\n助手回复:', data.content[0].text);
    }
  } catch (error) {
    console.error('Claude 格式测试失败:', error);
  }
}

// 测试错误处理
async function testErrorHandling() {
  console.log('\n\n=== 测试错误处理 ===\n');
  
  try {
    const response = await fetch(`${API_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer INVALID_KEY',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'user', content: 'Test' }
        ]
      })
    });
    
    console.log('状态码:', response.status);
    const data = await response.json();
    console.log('错误响应:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('错误处理测试失败:', error);
  }
}

// 测试工具调用
async function testToolCalling() {
  console.log('\n\n=== 测试工具调用 ===\n');
  
  try {
    const response = await fetch(`${API_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GEMINI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'What is the weather in Paris?' }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get the current weather for a location',
              parameters: {
                type: 'object',
                properties: {
                  location: {
                    type: 'string',
                    description: 'The city name'
                  }
                },
                required: ['location']
              }
            }
          }
        ],
        tool_choice: 'auto'
      })
    });
    
    console.log('状态码:', response.status);
    const data = await response.json();
    console.log('响应数据:', JSON.stringify(data, null, 2));
    
    if (data.choices && data.choices[0].message.tool_calls) {
      console.log('\n工具调用:', JSON.stringify(data.choices[0].message.tool_calls, null, 2));
    }
  } catch (error) {
    console.error('工具调用测试失败:', error);
  }
}

// 运行所有测试
async function runTests() {
  console.log('开始测试真实 Gemini API 调用...\n');
  console.log('API URL:', API_URL);
  console.log('使用 Gemini API KEY:', GEMINI_API_KEY.substring(0, 10) + '...');
  console.log('========================================\n');
  
  // 基本测试
  await testOpenAIFormat();
  await testStreamingResponse();
  await testClaudeFormat();
  
  // 高级测试
  await testErrorHandling();
  await testToolCalling();
  
  console.log('\n\n=== 测试完成 ===');
}

// 执行测试
runTests().catch(console.error);