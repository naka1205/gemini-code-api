const config = require('./config.cjs');

// 测试配置
const BASE_URL = config.API_BASE;
const API_KEY = config.API_KEY;

// 测试用例
const STREAMING_TESTS = [
  {
    name: 'OpenAI Chat Completions Streaming',
    endpoint: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: {
      model: 'gpt-4',
      messages: [
        { role: 'user', content: '请用中文简单介绍一下人工智能的发展历史' }
      ],
      stream: true,
      max_tokens: 100
    }
  },
  {
    name: 'Claude Messages Streaming',
    endpoint: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: {
      model: 'claude-3-sonnet-20240229',
      messages: [
        { role: 'user', content: '请用中文简单介绍一下机器学习的基本概念' }
      ],
      stream: true,
      max_tokens: 100
    }
  },
  {
    name: 'Gemini Generate Content Streaming',
    endpoint: '/v1beta/models/gemini-2.5-pro:streamGenerateContent',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': API_KEY
    },
    body: {
      contents: [
        {
          role: 'user',
          parts: [{ text: '请用中文简单介绍一下深度学习的应用领域' }]
        }
      ]
    }
  }
];

/**
 * 处理流式响应
 */
async function handleStreamingResponse(response, testName) {
  console.log(`\n=== ${testName} 流式响应 ===`);
  console.log(`状态码: ${response.status}`);
  console.log(`Content-Type: ${response.headers.get('content-type')}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.log(`❌ 错误响应: ${errorText}`);
    return false;
  }

  if (!response.body) {
    console.log('❌ 没有响应体');
    return false;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let chunkCount = 0;
  let totalContent = '';
  let rawChunkCount = 0;
  
  console.log('🔍 开始读取流式数据...');

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      rawChunkCount++;
      const chunk = decoder.decode(value, { stream: true });
      console.log(`原始数据块 ${rawChunkCount} (${chunk.length}字节):`, JSON.stringify(chunk.substring(0, 200)));
      
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim() && line.startsWith('data: ')) {
          chunkCount++;
          const data = line.slice(6);
          
          if (data === '[DONE]') {
            console.log('✅ 流式响应完成');
            break;
          }

          try {
            const jsonData = JSON.parse(data);
            
            // 提取文本内容（根据不同API格式）
            let content = '';
            if (jsonData.choices && jsonData.choices[0] && jsonData.choices[0].delta) {
              // OpenAI格式
              content = jsonData.choices[0].delta.content || '';
            } else if (jsonData.delta && jsonData.delta.text) {
              // Claude格式
              content = jsonData.delta.text;
            } else if (jsonData.candidates && jsonData.candidates[0] && jsonData.candidates[0].content) {
              // Gemini格式
              content = jsonData.candidates[0].content.parts?.[0]?.text || '';
            }
            
            if (content) {
              totalContent += content;
              process.stdout.write(content);
            }
          } catch (parseError) {
            console.log(`\n⚠️  解析JSON失败: ${data}`);
          }
        }
      }
    }
  } catch (error) {
    console.log(`\n❌ 读取流式响应时出错: ${error.message}`);
    return false;
  }

  console.log(`\n\n📊 统计信息:`);
  console.log(`- 接收到的数据块: ${chunkCount}`);
  console.log(`- 总内容长度: ${totalContent.length} 字符`);
  console.log(`- 内容预览: ${totalContent.substring(0, 100)}${totalContent.length > 100 ? '...' : ''}`);
  
  return chunkCount > 0 && totalContent.length > 0;
}

/**
 * 执行流式测试
 */
async function runStreamingTest(test) {
  const url = `${BASE_URL}${test.endpoint}`;
  
  console.log(`\n🚀 开始测试: ${test.name}`);
  console.log(`URL: ${url}`);
  console.log(`Method: ${test.method}`);
  
  try {
    const response = await fetch(url, {
      method: test.method,
      headers: test.headers,
      body: JSON.stringify(test.body)
    });

    const success = await handleStreamingResponse(response, test.name);
    return { name: test.name, success, status: response.status };
  } catch (error) {
    console.log(`❌ 请求失败: ${error.message}`);
    return { name: test.name, success: false, error: error.message };
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🔄 开始流式输出测试...');
  console.log(`API Base URL: ${BASE_URL}`);
  console.log(`使用API密钥: ${API_KEY.substring(0, 10)}...`);
  
  const results = [];
  
  for (const test of STREAMING_TESTS) {
    const result = await runStreamingTest(test);
    results.push(result);
    
    // 测试间隔
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // 输出测试总结
  console.log('\n' + '='.repeat(60));
  console.log('📋 流式测试总结');
  console.log('='.repeat(60));
  
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  
  results.forEach(result => {
    const status = result.success ? '✅ 通过' : '❌ 失败';
    const extra = result.error ? ` (${result.error})` : result.status ? ` (${result.status})` : '';
    console.log(`${status} ${result.name}${extra}`);
  });
  
  console.log(`\n🎯 成功率: ${successCount}/${totalCount} (${Math.round(successCount/totalCount*100)}%)`);
  
  if (successCount === totalCount) {
    console.log('🎉 所有流式测试都通过了！');
  } else {
    console.log('⚠️  部分流式测试失败，请检查日志。');
  }
  
  console.log('\n💡 提示: 使用 `npx wrangler tail` 查看详细日志');
}

// 运行测试
main().catch(console.error);