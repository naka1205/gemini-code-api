/**
 * 测试Thinking功能
 * 验证Gemini 2.5模型的思考内容是否正确显示
 */

const config = require('./config.cjs');

async function testThinking() {
  console.log('=== Thinking功能测试 ===\n');

  const testCases = [
    {
      name: 'Claude接口 - 非流式请求',
      url: `${config.API_BASE}/v1/messages`,
      body: {
        model: 'claude-3-sonnet-20240229', // 映射到gemini-2.0-flash
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: '请解释一下量子计算的基本原理，并思考它与传统计算的区别。'
          }
        ]
      }
    },
    {
      name: 'Claude接口 - 流式请求',
      url: `${config.API_BASE}/v1/messages`,
      body: {
        model: 'claude-opus-4-20250514', // 映射到gemini-2.5-pro
        max_tokens: 1000,
        stream: true,
        messages: [
          {
            role: 'user',
            content: '分析一下人工智能的发展趋势，请详细思考各个方面。'
          }
        ]
      }
    },
    {
      name: 'OpenAI接口 - 非流式请求',
      url: `${config.API_BASE}/v1/chat/completions`,
      body: {
        model: 'gpt-4o', // 映射到gemini-2.5-pro
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: '请思考并解释机器学习中的过拟合问题及其解决方案。'
          }
        ]
      }
    },
    {
      name: 'OpenAI接口 - 流式请求',
      url: `${config.API_BASE}/v1/chat/completions`,
      body: {
        model: 'gpt-4', // 映射到gemini-2.5-flash
        max_tokens: 1000,
        stream: true,
        messages: [
          {
            role: 'user',
            content: '深入思考区块链技术的优缺点，并分析其未来发展方向。'
          }
        ]
      }
    },
    {
      name: 'Gemini原生接口 - 非流式请求',
      url: `${config.API_BASE}/v1beta/models/gemini-2.5-pro:generateContent`,
      body: {
        contents: [
          {
            role: 'user',
            parts: [{ text: '请仔细思考并解释深度学习中的注意力机制原理。' }]
          }
        ],
        generationConfig: {
          maxOutputTokens: 1000
        }
      }
    }
  ];

  for (const testCase of testCases) {
    console.log(`--- 测试: ${testCase.name} ---`);
    console.log('请求内容:');
    console.log(JSON.stringify(testCase.body, null, 2));
    console.log();

    try {
      const response = await fetch(testCase.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.API_KEY}`,
          'x-debug-request': 'true' // 启用调试日志
        },
        body: JSON.stringify(testCase.body)
      });

      console.log(`响应状态码: ${response.status}`);

      if (response.ok) {
        if (testCase.body.stream) {
          console.log('✅ 流式请求成功');
          console.log('流式响应内容:');
          
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let eventCount = 0;
          let hasThinking = false;
          
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              const chunk = decoder.decode(value);
              const lines = chunk.split('\n');
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.substring(6);
                  if (data.trim() === '[DONE]') {
                    console.log('流式响应结束');
                    break;
                  }
                  
                  try {
                    const parsed = JSON.parse(data);
                    eventCount++;
                    
                    // 检查是否包含thinking内容
                    if (parsed.delta && parsed.delta.text && parsed.delta.text.includes('thinking')) {
                      hasThinking = true;
                    }
                    
                    if (eventCount <= 5) {
                      console.log(`事件 ${eventCount}:`, JSON.stringify(parsed, null, 2));
                    }
                  } catch (e) {
                    // 忽略解析错误
                  }
                }
              }
              
              if (eventCount >= 10) break; // 限制输出
            }
          } finally {
            reader.releaseLock();
          }
          
          console.log(`总事件数: ${eventCount}`);
          console.log(`包含thinking内容: ${hasThinking ? '是' : '否'}`);
        } else {
          console.log('✅ 请求成功');
          const data = await response.json();
          
          // 检查响应中是否包含thinking相关内容
          const responseText = JSON.stringify(data);
          const hasThinking = responseText.includes('thinking') || responseText.includes('思考');
          
          console.log('响应数据结构:');
          console.log(JSON.stringify(data, null, 2));
          console.log(`包含thinking内容: ${hasThinking ? '是' : '否'}`);
        }
      } else {
        console.log('❌ 请求失败');
        const errorText = await response.text();
        console.log('错误信息:', errorText);
      }
    } catch (error) {
      console.log('❌ 请求异常:', error.message);
    }

    console.log('\n' + '='.repeat(50) + '\n');
  }
}

// 运行测试
testThinking().catch(console.error);