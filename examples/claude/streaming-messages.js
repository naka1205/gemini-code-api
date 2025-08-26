/**
 * Claude 流式响应示例
 * 展示实时流式对话功能
 */

const { makeClaudeRequest, saveResponse, withPerformanceMonitoring, delay, Logger } = require('../utils');
const { config } = require('../config');

const logger = new Logger('claude-streaming');

/**
 * 解析 SSE 事件流
 */
function parseSSEEvent(text) {
  const events = [];
  const lines = text.split('\n');
  let currentEvent = {};
  
  for (const line of lines) {
    if (line.startsWith('event: ')) {
      if (Object.keys(currentEvent).length > 0) {
        events.push(currentEvent);
      }
      currentEvent = { event: line.substring(7) };
    } else if (line.startsWith('data: ')) {
      try {
        currentEvent.data = JSON.parse(line.substring(6));
      } catch (e) {
        currentEvent.data = line.substring(6);
      }
    }
  }
  
  if (Object.keys(currentEvent).length > 0) {
    events.push(currentEvent);
  }
  
  return events;
}

/**
 * 基础流式对话
 */
async function testBasicStreaming() {
  logger.info('开始测试基础流式对话');
  
  try {
    const model = config.models.claude.default;
    const messages = [{
      role: 'user',
      content: '请用流式方式讲述一个关于人工智能发展的故事，每句话都要停顿一下。'
    }];

    const response = await makeClaudeRequest(model, messages, {
      stream: true,
      max_tokens: 1000,
      temperature: 0.7
    });

    logger.info('流式响应开始');
    let fullResponse = '';
    let chunkCount = 0;
    let events = [];

    // 修复：处理 SSE 格式的流式响应
    if (typeof response === 'string') {
      // 响应是 SSE 格式的字符串
      const lines = response.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          chunkCount++;
          const data = line.substring(6);
          if (data.trim() === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
              process.stdout.write(parsed.delta.text);
              fullResponse += parsed.delta.text;
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    } else if (response && response.body) {
      // 响应是标准的流式对象
      for await (const chunk of response.body) {
        chunkCount++;
        const text = new TextDecoder().decode(chunk);
        process.stdout.write(text);
        fullResponse += text;
        
        // 模拟实时效果
        await delay(50);
      }
    } else {
      logger.warn('未知的响应格式:', typeof response);
      return { success: false, error: 'Unknown response format' };
    }

    logger.info(`流式响应完成，共接收 ${chunkCount} 个数据块`);
    await saveResponse('claude-streaming-basic', { 
      response: fullResponse, 
      chunkCount,
      responseType: typeof response,
      hasBody: !!(response && response.body)
    }, {
      // 请求详情
    });
    
    return { success: true, chunkCount, responseLength: fullResponse.length };
  } catch (error) {
    logger.error('基础流式对话测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 多轮流式对话
 */
async function testMultiTurnStreaming() {
  logger.info('开始测试多轮流式对话');
  
  try {
    const model = config.models.claude.default;
    const conversation = [
      {
        role: 'user',
        content: '你好，我想了解机器学习的基本概念。'
      }
    ];

    // 第一轮对话
    logger.info('第一轮对话');
    const response1 = await makeClaudeRequest(model, conversation, {
      stream: true,
      max_tokens: 500
    });

    let response1Text = '';
    if (typeof response1 === 'string') {
      // 处理 SSE 格式
      const lines = response1.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6);
          if (data.trim() === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
              response1Text += parsed.delta.text;
            }
          } catch (e) {}
        }
      }
    } else if (response1 && response1.body) {
      // 处理标准流式对象
      for await (const chunk of response1.body) {
        const text = new TextDecoder().decode(chunk);
        response1Text += text;
        await delay(30);
      }
    }

    // 添加第一轮回复到对话历史
    conversation.push({
      role: 'assistant',
      content: response1Text
    });

    // 添加延迟，避免过快请求
    logger.info('⏳ 等待 3 秒后开始第二轮对话...');
    await delay(3000);

    // 第二轮对话
    logger.info('\n第二轮对话');
    conversation.push({
      role: 'user',
      content: '能详细解释一下监督学习和无监督学习的区别吗？'
    });

    const response2 = await makeClaudeRequest(model, conversation, {
      stream: true,
      max_tokens: 600
    });

    let response2Text = '';
    if (typeof response2 === 'string') {
      // 处理 SSE 格式
      const lines = response2.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6);
          if (data.trim() === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
              response2Text += parsed.delta.text;
            }
          } catch (e) {}
        }
      }
    } else if (response2 && response2.body) {
      // 处理标准流式对象
      for await (const chunk of response2.body) {
        const text = new TextDecoder().decode(chunk);
        response2Text += text;
        await delay(30);
      }
    }

    logger.success('多轮流式对话测试成功', {
      model,
      turns: 2,
      totalLength: response1Text.length + response2Text.length
    });

    await saveResponse('claude-streaming-multi-turn', { 
      response1: response1Text, 
      response2: response2Text, 
      conversation 
    }, {
      // 请求详情
    });

    return { success: true, turns: 2, totalLength: response1Text.length + response2Text.length };
  } catch (error) {
    logger.error('多轮流式对话测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 流式代码生成
 */
async function testStreamingCodeGeneration() {
  logger.info('开始测试流式代码生成');
  
  try {
    const model = config.models.claude.default;
    const messages = [{
      role: 'user',
      content: '请用Python编写一个函数，实现快速排序算法，并添加详细的注释说明。'
    }];

    const response = await makeClaudeRequest(model, messages, {
      stream: true,
      max_tokens: 800,
      temperature: 0.3
    });

    let fullCode = '';
    let chunkCount = 0;

    if (typeof response === 'string') {
      // 处理 SSE 格式
      const lines = response.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          chunkCount++;
          const data = line.substring(6);
          if (data.trim() === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
              process.stdout.write(parsed.delta.text);
              fullCode += parsed.delta.text;
            }
          } catch (e) {}
        }
      }
    } else if (response && response.body) {
      // 处理标准流式对象
      for await (const chunk of response.body) {
        chunkCount++;
        const text = new TextDecoder().decode(chunk);
        process.stdout.write(text);
        fullCode += text;
        await delay(40);
      }
    }

    logger.success('流式代码生成测试成功', {
      model,
      chunkCount,
      codeLength: fullCode.length
    });

    await saveResponse('claude-streaming-code', { 
      code: fullCode, 
      chunkCount,
      model 
    }, {
      // 请求详情
    });

    return { success: true, chunkCount, codeLength: fullCode.length };
  } catch (error) {
    logger.error('流式代码生成测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 流式创意写作
 */
async function testStreamingCreativeWriting() {
  logger.info('开始测试流式创意写作');
  
  try {
    const model = config.models.claude.opus4;
    const messages = [{
      role: 'user',
      content: '请写一个关于人工智能的短篇科幻故事，要求有令人印象深刻的转折。'
    }];

    const response = await makeClaudeRequest(model, messages, {
      stream: true,
      max_tokens: 1000,
      temperature: 0.8
    });

    let fullStory = '';
    let chunkCount = 0;

    if (typeof response === 'string') {
      // 处理 SSE 格式
      const lines = response.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          chunkCount++;
          const data = line.substring(6);
          if (data.trim() === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
              process.stdout.write(parsed.delta.text);
              fullStory += parsed.delta.text;
            }
          } catch (e) {}
        }
      }
    } else if (response && response.body) {
      // 处理标准流式对象
      for await (const chunk of response.body) {
        chunkCount++;
        const text = new TextDecoder().decode(chunk);
        process.stdout.write(text);
        fullStory += text;
        await delay(45);
      }
    }

    logger.success('流式创意写作测试成功', {
      model,
      chunkCount,
      storyLength: fullStory.length
    });

    await saveResponse('claude-streaming-creative', { 
      story: fullStory, 
      chunkCount,
      model 
    }, {
      // 请求详情
    });

    return { success: true, chunkCount, storyLength: fullStory.length };
  } catch (error) {
    logger.error('流式创意写作测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 流式实时翻译
 */
async function testStreamingTranslation() {
  logger.info('开始测试流式实时翻译');
  
  try {
    const model = config.models.claude.default;
    const messages = [{
      role: 'user',
      content: '请将以下英文句子翻译成中文：Artificial Intelligence is transforming the way we live and work.'
    }];

    const response = await makeClaudeRequest(model, messages, {
      stream: true,
      max_tokens: 300,
      temperature: 0.5
    });

    let fullTranslation = '';
    let chunkCount = 0;

    if (typeof response === 'string') {
      // 处理 SSE 格式
      const lines = response.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          chunkCount++;
          const data = line.substring(6);
          if (data.trim() === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
              process.stdout.write(parsed.delta.text);
              fullTranslation += parsed.delta.text;
            }
          } catch (e) {}
        }
      }
    } else if (response && response.body) {
      // 处理标准流式对象
      for await (const chunk of response.body) {
        chunkCount++;
        const text = new TextDecoder().decode(chunk);
        process.stdout.write(text);
        fullTranslation += text;
        await delay(35);
      }
    }

    logger.success('流式实时翻译测试成功', {
      model,
      chunkCount,
      translationLength: fullTranslation.length
    });

    await saveResponse('claude-streaming-translation', { 
      translation: fullTranslation, 
      chunkCount,
      model 
    }, {
      // 请求详情
    });

    return { success: true, chunkCount, translationLength: fullTranslation.length };
  } catch (error) {
    logger.error('流式实时翻译测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 流式数据分析
 */
async function testStreamingDataAnalysis() {
  logger.info('开始测试流式数据分析');
  
  try {
    const model = config.models.claude.default;
    const data = `
销售数据：
- 第一季度：$120,000
- 第二季度：$150,000
- 第三季度：$180,000
- 第四季度：$200,000
    `;

    const messages = [{
      role: 'user',
      content: `请对流式分析以下销售数据，逐步提供分析结果：\n\n${data}`
    }];

    const response = await makeClaudeRequest(model, messages, {
      stream: true,
      max_tokens: 1500,
      temperature: 0.4
    });

    logger.info('开始流式数据分析');
    let fullAnalysis = '';
    let sectionCount = 0;

    if (typeof response === 'string') {
      // 处理 SSE 格式
      const lines = response.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6);
          if (data.trim() === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
              process.stdout.write(parsed.delta.text);
              fullAnalysis += parsed.delta.text;
              
              // 统计分析段落数
              if (parsed.delta.text.includes('##') || parsed.delta.text.includes('**')) {
                sectionCount++;
              }
            }
          } catch (e) {}
        }
      }
    } else if (response && response.body) {
      // 处理标准流式对象
      for await (const chunk of response.body) {
        const text = new TextDecoder().decode(chunk);
        process.stdout.write(text);
        fullAnalysis += text;
        
        // 统计分析段落数
        if (text.includes('##') || text.includes('**')) {
          sectionCount++;
        }
        
        await delay(45);
      }
    }

    logger.info(`流式数据分析完成，共 ${sectionCount} 个分析段落`);
    await saveResponse('claude-streaming-analysis', { 
      analysis: fullAnalysis, 
      sectionCount,
      originalData: data
    }, {
      // 请求详情
    });
    
    return { success: true, sectionCount, analysisLength: fullAnalysis.length };
  } catch (error) {
    logger.error('流式数据分析测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 主函数
 */
async function main() {
  logger.info('=== Claude 流式响应示例开始 ===');
  
  const results = [];
  
  // 运行所有测试，每个测试之间添加延迟
  const tests = [
    { name: '基础流式对话', fn: testBasicStreaming },
    { name: '多轮流式对话', fn: testMultiTurnStreaming },
    { name: '流式代码生成', fn: testStreamingCodeGeneration },
    { name: '流式创意写作', fn: testStreamingCreativeWriting },
    { name: '流式实时翻译', fn: testStreamingTranslation },
    { name: '流式数据分析', fn: testStreamingDataAnalysis }
  ];

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    logger.info(`\n--- 开始测试: ${test.name} ---`);
    
    const result = await withPerformanceMonitoring(test.fn, test.name);
    results.push({ name: test.name, ...result });
    
    // 优化：每个测试完成后添加延迟，避免过快消耗配额
    if (i < tests.length - 1) { // 最后一个测试不需要延迟
      const delayTime = Math.floor(Math.random() * 4000) + 3000; // 3-7秒随机延迟
      logger.info(`⏳ 测试完成，等待 ${delayTime}ms 后开始下一个测试...`);
      await delay(delayTime);
    }
  }

  // 输出结果摘要
  logger.info('\n=== 测试结果摘要 ===');
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  
  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    logger.info(`${status} ${result.name}: ${result.success ? '成功' : result.error}`);
  });

  logger.info(`\n总结: ${successCount}/${totalCount} 个测试成功`);
  
  return results;
}

// 如果直接运行此文件
if (require.main === module) {
  main().catch(error => {
    logger.error('示例运行失败:', error);
    process.exit(1);
  });
}

module.exports = {
  testBasicStreaming,
  testMultiTurnStreaming,
  testStreamingCodeGeneration,
  testStreamingCreativeWriting,
  testStreamingTranslation,
  testStreamingDataAnalysis,
  main
};
