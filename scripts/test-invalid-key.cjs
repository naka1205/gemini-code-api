const config = require('./config.cjs');

const BASE_URL = 'https://gemini-code-api.nkkk.workers.dev';

/**
 * 测试无效API key的错误处理
 */
async function testInvalidApiKey() {
  console.log('=== 测试无效API key错误处理 ===\n');
  
  const testCases = [
    {
      name: '空API key',
      apiKey: '',
      expectedError: 'Authentication failed'
    },
    {
      name: '不以AI开头的key',
      apiKey: 'sk-1234567890abcdef',
      expectedError: 'API key must start with "AI"'
    },
    {
      name: '太短的AI key',
      apiKey: 'AI',
      expectedError: 'API key must start with "AI"'
    },
    {
      name: '无效格式的key',
      apiKey: 'invalid-key-format',
      expectedError: 'API key must start with "AI"'
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`测试: ${testCase.name}`);
    console.log(`API Key: "${testCase.apiKey}"`);
    
    try {
      const response = await fetch(`${config.API_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testCase.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{
            role: 'user',
            content: 'Hello'
          }]
        })
      });
      
      console.log(`状态码: ${response.status}`);
      
      if (response.status === 500) {
        console.log('❌ 返回500错误，说明仍有内部错误');
        const text = await response.text();
        console.log('Response text:', text.substring(0, 200));
      } else {
        try {
          const result = await response.json();
          
          if (response.ok) {
            console.log('❌ 预期失败但成功了');
            console.log('Response:', result);
          } else {
            console.log(`✅ 正确返回错误 (${response.status})`);
            console.log('Error:', result.error?.message || result.message || JSON.stringify(result));
            
            // 检查是否包含预期的错误信息
            const errorMessage = result.error?.message || result.message || '';
            if (errorMessage.includes('AI')) {
              console.log('✅ 错误信息包含AI key提示');
            } else {
              console.log('⚠️  错误信息未包含AI key提示');
            }
          }
        } catch (jsonError) {
          console.log('❌ 无法解析JSON响应');
          const text = await response.text();
          console.log('Response text:', text.substring(0, 200));
        }
      }
    } catch (error) {
      console.log('❌ 请求失败:', error.message);
    }
    
    console.log('---\n');
  }
}

// 运行测试
testInvalidApiKey().catch(console.error);