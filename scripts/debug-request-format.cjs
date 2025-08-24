const { API_BASE, API_KEY } = require('./config.cjs');

// 测试Claude请求转换
async function testClaudeRequestFormat() {
  console.log('=== 调试Claude请求格式转换 ===\n');
  
  const testRequest = {
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
  };

  console.log('原始Claude请求:');
  console.log(JSON.stringify(testRequest, null, 2));
  console.log('\n' + '='.repeat(50) + '\n');

  try {
    const response = await fetch(`${API_BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'x-debug-request': 'true' // 添加调试标头
      },
      body: JSON.stringify(testRequest)
    });

    const responseData = await response.json();
    
    console.log(`响应状态码: ${response.status}`);
    
    if (response.ok) {
      console.log('✅ 请求成功');
      console.log('响应预览:', responseData.content?.[0]?.text?.substring(0, 50) + '...');
    } else {
      console.log('❌ 错误响应:');
      console.log(JSON.stringify(responseData, null, 2));
    }
  } catch (error) {
    console.error('请求失败:', error.message);
  }
}

testClaudeRequestFormat();