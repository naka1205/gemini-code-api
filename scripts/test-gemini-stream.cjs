// 使用内置的fetch API (Node.js 18+)
const config = require('./config.cjs');

// 测试Gemini流式API
async function testGeminiStream() {
  const API_KEY = config.API_KEY;
  
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=${API_KEY}`;
  
  const requestBody = {
    contents: [{
      role: 'user',
      parts: [{ text: '请简单介绍一下人工智能' }]
    }]
  };
  
  console.log('🔄 测试Gemini流式API...');
  console.log('URL:', geminiUrl.replace(API_KEY, '***'));
  
  try {
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'gemini-code-api/2.0.0',
      },
      body: JSON.stringify(requestBody),
    });
    
    console.log('状态码:', response.status);
    console.log('Content-Type:', response.headers.get('content-type'));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('错误响应:', errorText);
      return;
    }
    
    if (!response.body) {
      console.error('没有响应体');
      return;
    }
    
    console.log('\n=== 原始流式响应 ===');
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let chunkCount = 0;
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunkCount++;
        const text = decoder.decode(value, { stream: true });
        buffer += text;
        
        console.log(`数据块 ${chunkCount}:`, JSON.stringify(text));
        
        // 处理完整的行
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim() && line.startsWith('data: ')) {
            try {
              const jsonData = JSON.parse(line.slice(6));
              console.log('解析的JSON:', JSON.stringify(jsonData, null, 2));
            } catch (e) {
              console.log('无法解析的行:', line);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    
    console.log(`\n总共接收到 ${chunkCount} 个数据块`);
    
  } catch (error) {
    console.error('请求失败:', error.message);
  }
}

testGeminiStream();