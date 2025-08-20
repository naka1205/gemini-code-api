const API_BASE = 'https://xxxx';
const API_KEY = 'xxxxx';

// 测试配置
const TEST_CONFIG = {
  // Claude测试
  claude: {
    model: 'claude-3-7-sonnet-20250219',
    messages: [
      {
        role: 'user',
        content: '请思考一下如何解决一个复杂的数学问题，然后给出答案。'
      }
    ],
    max_tokens: 1000,
    stream: true
  },
  
  // OpenAI测试
  openai: {
    model: 'gpt-4',
    messages: [
      {
        role: 'user',
        content: '请思考一下如何解决一个复杂的数学问题，然后给出答案。'
      }
    ],
    max_tokens: 1000,
    stream: true,
    reasoning_effort: 'medium' // 测试思考功能
  },
  
  // 原生Gemini测试
  gemini: {
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: '请思考一下如何解决一个复杂的数学问题，然后给出答案。'
          }
        ]
      }
    ],
    generationConfig: {
      maxOutputTokens: 1000,
      thinkingConfig: {
        thinkingBudget: 8192
      }
    }
  }
};

// 工具函数
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function logError(message, error) {
  log(message, 'error');
  if (error) {
    console.error(error);
  }
}

function logSuccess(message) {
  log(message, 'success');
}

// 测试Claude流式接口
async function testClaudeStreaming() {
  log('开始测试Claude流式接口...');
  
  try {
    const response = await fetch(`${API_BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(TEST_CONFIG.claude)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    logSuccess('Claude流式请求成功，开始读取流...');
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let hasThinking = false;
    let hasContent = false;
    let tokenCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6).trim();
          if (data === '[DONE]') {
            logSuccess('Claude流式响应完成');
            if (hasThinking) {
              logSuccess('✅ 检测到思考内容');
            }
            if (hasContent) {
              logSuccess('✅ 检测到正常内容');
            }
            return;
          }

          try {
            const parsed = JSON.parse(data);
            
            // 检查思考内容（Claude thinking_delta）
            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'thinking_delta') {
              hasThinking = true;
              log('检测到思考内容: ' + (parsed.delta.thinking || '').substring(0, 100) + '...');
            }
            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta' && parsed.delta.text) {
              hasContent = true;
            }
            
            // 检查token使用情况
            if (parsed.type === 'message_delta' && parsed.usage) {
              tokenCount = parsed.usage.output_tokens || 0;
              log(`Token使用情况: 输入=${parsed.usage.input_tokens}, 输出=${parsed.usage.output_tokens}`);
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }
  } catch (error) {
    logError('Claude流式测试失败', error);
  }
}

// 测试OpenAI流式接口
async function testOpenAIStreaming() {
  log('开始测试OpenAI流式接口...');
  
  try {
    const response = await fetch(`${API_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(TEST_CONFIG.openai)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    logSuccess('OpenAI流式请求成功，开始读取流...');
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let hasThinking = false;
    let hasContent = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6).trim();
          if (data === '[DONE]') {
            logSuccess('OpenAI流式响应完成');
            if (hasThinking) {
              logSuccess('✅ 检测到思考内容');
            }
            if (hasContent) {
              logSuccess('✅ 检测到正常内容');
            }
            return;
          }

          try {
            const parsed = JSON.parse(data);
            
            // 检查思考内容
            if (parsed.choices && parsed.choices[0]?.delta?.content) {
              const content = parsed.choices[0].delta.content;
              if (content.includes('<thinking>')) {
                hasThinking = true;
                log('检测到思考内容: ' + content.substring(0, 100) + '...');
              } else {
                hasContent = true;
              }
            }
            
            // 检查token使用情况
            if (parsed.usage) {
              log(`Token使用情况: 输入=${parsed.usage.prompt_tokens}, 输出=${parsed.usage.completion_tokens}`);
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }
  } catch (error) {
    logError('OpenAI流式测试失败', error);
  }
}

// 测试原生Gemini接口
async function testGeminiNative() {
  log('开始测试原生Gemini接口...');
  
  try {
    const response = await fetch(`${API_BASE}/v1beta/models/${TEST_CONFIG.gemini.model}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': API_KEY
      },
      body: JSON.stringify(TEST_CONFIG.gemini)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    logSuccess('原生Gemini流式请求成功，开始读取流...');
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let hasThinking = false;
    let hasContent = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6).trim();
          if (data === '[DONE]') {
            logSuccess('原生Gemini流式响应完成');
            if (hasThinking) {
              logSuccess('✅ 检测到思考内容');
            }
            if (hasContent) {
              logSuccess('✅ 检测到正常内容');
            }
            return;
          }

          try {
            const parsed = JSON.parse(data);
            
            // 检查思考内容
            if (parsed.candidates && parsed.candidates[0]?.thought) {
              hasThinking = true;
              log('检测到思考内容: ' + parsed.candidates[0].thought.substring(0, 100) + '...');
            }
            
            if (parsed.candidates && parsed.candidates[0]?.content?.parts) {
              hasContent = true;
            }
            
            // 检查token使用情况
            if (parsed.usageMetadata) {
              log(`Token使用情况: 输入=${parsed.usageMetadata.promptTokenCount}, 输出=${parsed.usageMetadata.candidatesTokenCount}`);
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }
  } catch (error) {
    logError('原生Gemini测试失败', error);
  }
}

// 测试Claude非流式接口
async function testClaudeNonStreaming() {
  log('开始测试Claude非流式接口...');
  
  try {
    const testConfig = { ...TEST_CONFIG.claude, stream: false };
    
    const response = await fetch(`${API_BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(testConfig)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    logSuccess('Claude非流式请求成功');
    
    // 检查思考内容（thinking 内容块）
    if (data.content && data.content.some(block => block.type === 'thinking' || block.type === 'redacted_thinking')) {
      logSuccess('✅ 检测到思考内容');
    }
    
    // 检查token使用情况
    if (data.usage) {
      log(`Token使用情况: 输入=${data.usage.input_tokens}, 输出=${data.usage.output_tokens}`);
    }
    
    return data;
  } catch (error) {
    logError('Claude非流式测试失败', error);
  }
}

// 测试OpenAI非流式接口
async function testOpenAINonStreaming() {
  log('开始测试OpenAI非流式接口...');
  
  try {
    const testConfig = { ...TEST_CONFIG.openai, stream: false };
    
    const response = await fetch(`${API_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(testConfig)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    logSuccess('OpenAI非流式请求成功');
    
    // 检查思考内容
    if (data.choices && data.choices[0]?.message?.content && data.choices[0].message.content.includes('<thinking>')) {
      logSuccess('✅ 检测到思考内容');
    }
    
    // 检查token使用情况
    if (data.usage) {
      log(`Token使用情况: 输入=${data.usage.prompt_tokens}, 输出=${data.usage.completion_tokens}`);
    }
    
    return data;
  } catch (error) {
    logError('OpenAI非流式测试失败', error);
  }
}

// 主测试函数
async function runAllTests() {
  log('🚀 开始API接口测试...');
  log(`测试地址: ${API_BASE}`);
  
  // 测试流式接口
  log('\n📡 测试流式接口...');
  await testClaudeStreaming();
  await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒
  
  await testOpenAIStreaming();
  await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒
  
  await testGeminiNative();
  await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒
  
  // 测试非流式接口
  log('\n📄 测试非流式接口...');
  await testClaudeNonStreaming();
  await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒
  
  await testOpenAINonStreaming();
  
  log('\n🎉 所有测试完成！');
}

// 运行测试
runAllTests().catch(error => {
  logError('测试运行失败', error);
  process.exit(1);
});
