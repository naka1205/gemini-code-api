/**
 * Claude 基础消息示例
 * 展示基本的消息发送和接收功能
 */

const { makeClaudeRequest, saveResponse, withPerformanceMonitoring, delay, Logger } = require('../utils');
const { config } = require('../config');

const logger = new Logger('Claude-BasicMessages');

/**
 * 基础消息测试
 */
async function testBasicMessage() {
  logger.info('开始基础消息测试', { model: config.models.claude.default });
  
  try {
    const messages = [{
      role: 'user',
      content: '你好，请简单介绍一下你自己。'
    }];

    const response = await makeClaudeRequest(config.models.claude.default, messages, {
      max_tokens: 1200,
      temperature: 0.7,
      thinking: { type: 'disabled' }
    });

    const responseText = response.content?.[0]?.text || response.content?.[0]?.thinking || '无响应内容';
    const responseLength = responseText.length;

    logger.success('基础消息测试成功', {
      model: config.models.claude.default,
      responseLength,
      usage: response.usage
    });

    console.log('\n📝 基础消息结果:');
    console.log('─'.repeat(50));
    console.log(responseText);
    console.log('─'.repeat(50));

    await saveResponse('claude-基础消息', response, {
      model: config.models.claude.default,
      testType: '基础消息'
    });

    return { success: true, responseLength, usage: response.usage };
  } catch (error) {
    logger.error('基础消息测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 多轮对话测试
 */
async function testMultiTurnConversation() {
  logger.info('开始多轮对话测试', { model: config.models.claude.default });
  
  try {
    const conversation = [
      { role: 'user', content: '你好，我想了解机器学习的基本概念。' }
    ];

    // 第一轮对话
    logger.info('第一轮对话');
    const response1 = await makeClaudeRequest(config.models.claude.default, conversation, {
      max_tokens: 1024,
      thinking: { type: 'disabled' }
    });

    const response1Text = response1.content?.[0]?.text || response1.content?.[0]?.thinking || '无响应内容';
    conversation.push({ role: 'assistant', content: response1Text });

    // 添加延迟，避免过快请求
    await delay(2000);

    // 第二轮对话
    logger.info('第二轮对话');
    conversation.push({ role: 'user', content: '能详细解释一下监督学习和无监督学习的区别吗？' });

    const response2 = await makeClaudeRequest(config.models.claude.default, conversation, {
      max_tokens: 1400,
      thinking: { type: 'disabled' }
    });

    const response2Text = response2.content?.[0]?.text || response2.content?.[0]?.thinking || '无响应内容';

    logger.success('多轮对话测试成功', {
      model: config.models.claude.default,
      turns: 2,
      totalLength: response1Text.length + response2Text.length
    });

    await saveResponse('claude-多轮对话', { response1, response2, conversation }, {
      model: config.models.claude.default,
      testType: '多轮对话'
    });

    return { success: true, turns: 2, totalLength: response1Text.length + response2Text.length };
  } catch (error) {
    logger.error('多轮对话测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 创意写作测试
 */
async function testCreativeWriting() {
  logger.info('开始创意写作测试', { model: config.models.claude.opus4 });
  
  try {
    const messages = [{
      role: 'user',
      content: '请写一个300-500字的短篇科幻故事，主题是人工智能。要求有令人印象深刻的转折，语言生动有趣。'
    }];

    const response = await makeClaudeRequest(config.models.claude.opus4, messages, {
      max_tokens: 1800,
      temperature: 0.8,
      thinking: { type: 'disabled' }
    });

    const responseText = response.content?.[0]?.text || response.content?.[0]?.thinking || '无响应内容';
    const responseLength = responseText.length;

    logger.success('创意写作测试成功', {
      model: config.models.claude.opus4,
      responseLength,
      usage: response.usage
    });

    console.log('\n📝 创意写作结果:');
    console.log('─'.repeat(50));
    console.log(responseText);
    console.log('─'.repeat(50));

    await saveResponse('claude-创意写作', response, {
      model: config.models.claude.opus4,
      testType: '创意写作'
    });

    return { success: true, responseLength, usage: response.usage };
  } catch (error) {
    logger.error('创意写作测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 代码生成测试
 */
async function testCodeGeneration() {
  logger.info('开始代码生成测试', { model: config.models.claude.default });
  
  try {
    const messages = [{
      role: 'user',
      content: '请用Python编写一个函数，实现快速排序算法，并添加详细的注释说明。'
    }];

    const response = await makeClaudeRequest(config.models.claude.default, messages, {
      max_tokens: 1600,
      temperature: 0.3,
      thinking: { type: 'disabled' }
    });

    const responseText = response.content?.[0]?.text || response.content?.[0]?.thinking || '无响应内容';
    const responseLength = responseText.length;

    logger.success('代码生成测试成功', {
      model: config.models.claude.default,
      responseLength,
      usage: response.usage
    });

    await saveResponse('claude-代码生成', response, {
      model: config.models.claude.default,
      testType: '代码生成'
    });

    return { success: true, responseLength, usage: response.usage };
  } catch (error) {
    logger.error('代码生成测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 系统消息测试
 */
async function testSystemMessage() {
  logger.info('开始系统消息测试', { model: config.models.claude.default });
  
  try {
    const messages = [{
      role: 'user',
      content: '请帮我分析一下当前人工智能技术的发展趋势。'
    }];

    const response = await makeClaudeRequest(config.models.claude.default, messages, {
      system: '你是一位资深的AI技术专家，擅长分析技术趋势和提供专业见解。请用专业但易懂的语言回答。',
      max_tokens: 1400,
      temperature: 0.6,
      thinking: { type: 'disabled' }
    });

    const responseText = response.content?.[0]?.text || response.content?.[0]?.thinking || '无响应内容';
    const responseLength = responseText.length;

    logger.success('系统消息测试成功', {
      model: config.models.claude.default,
      responseLength,
      usage: response.usage
    });

    await saveResponse('claude-系统消息', response, {
      model: config.models.claude.default,
      testType: '系统消息'
    });

    return { success: true, responseLength, usage: response.usage };
  } catch (error) {
    logger.error('系统消息测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 复杂推理测试
 */
async function testComplexReasoning() {
  logger.info('开始复杂推理测试', { model: config.models.claude.opus4 });
  
  try {
    const messages = [{
      role: 'user',
      content: '在一个小岛上，只有两种人：诚实者和说谎者。诚实者总是说真话，说谎者总是说假话。有一天，岛上一个人说："我是说谎者。"请问这个人是什么身份？请详细解释你的推理过程。'
    }];

    const response = await makeClaudeRequest(config.models.claude.opus4, messages, {
      max_tokens: 1600,
      temperature: 0.4,
      thinking: { type: 'disabled' }
    });

    const responseText = response.content?.[0]?.text || response.content?.[0]?.thinking || '无响应内容';
    const responseLength = responseText.length;

    logger.success('复杂推理测试成功', {
      model: config.models.claude.opus4,
      responseLength,
      usage: response.usage
    });

    console.log('\n🧠 推理结果:');
    console.log('─'.repeat(50));
    console.log(responseText);
    console.log('─'.repeat(50));

    await saveResponse('claude-复杂推理', response, {
      model: config.models.claude.default,
      testType: '复杂推理'
    });

    return { success: true, responseLength, usage: response.usage };
  } catch (error) {
    logger.error('复杂推理测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 多语言测试
 */
async function testMultilingual() {
  logger.info('开始多语言测试', { model: config.models.claude.default });
  
  const languages = ['中文', 'English', '日本語'];
  const results = [];

  for (const lang of languages) {
    logger.info('处理语言:', lang);
    
    try {
      const messages = [{
        role: 'user',
        content: lang === '中文' ? '请用中文介绍一下人工智能的发展历史。' :
                 lang === 'English' ? 'Please introduce the development history of artificial intelligence in English.' :
                 '人工知能の発展の歴史について日本語で説明してください。'
      }];

      const response = await makeClaudeRequest(config.models.claude.default, messages, {
        max_tokens: 900,
        temperature: 0.6,
        thinking: { type: 'disabled' }
      });

      const responseText = response.content?.[0]?.text || response.content?.[0]?.thinking || '无响应内容';
      results.push({ language: lang, success: true, responseLength: responseText.length });

      // 添加延迟，避免过快请求
      await delay(3000);

    } catch (error) {
      logger.error(`${lang} 语言测试失败:`, error);
      results.push({ language: lang, success: false, error: error.message });
    }
  }

  const successCount = results.filter(r => r.success).length;
  logger.success('多语言测试完成', { total: languages.length, success: successCount });

      await saveResponse('claude-多语言', { results, languages }, {
      model: config.models.claude.default,
      testType: '多语言'
    });

  return { success: successCount === languages.length, results };
}

/**
 * 主函数
 */
async function main() {
  logger.info('🚀 开始运行 Claude 基础消息示例');
  
  const results = [];
  
  // 运行所有测试，每个测试之间添加延迟
  const tests = [
    { name: '基础消息', fn: testBasicMessage },
    { name: '多轮对话', fn: testMultiTurnConversation },
    { name: '创意写作', fn: testCreativeWriting },
    { name: '代码生成', fn: testCodeGeneration },
    { name: '系统消息', fn: testSystemMessage },
    { name: '复杂推理', fn: testComplexReasoning },
    { name: '多语言', fn: testMultilingual }
  ];

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    logger.info(`开始测试: ${test.name}`);
    
    const result = await withPerformanceMonitoring(test.fn, test.name)();
    results.push({ name: test.name, ...result });
    
    // 优化：每个测试完成后添加延迟，避免过快消耗配额
    if (i < tests.length - 1) { // 最后一个测试不需要延迟
      const delayTime = Math.floor(Math.random() * 3000) + 2000; // 2-5秒随机延迟
      logger.info(`⏳ 测试完成，等待 ${delayTime}ms 后开始下一个测试...`);
      await delay(delayTime);
    }
  }

  // 输出测试总结
  console.log('\n📊 测试总结:');
  console.log('─'.repeat(50));
  
  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    const message = result.success ? 
      `${result.responseLength || result.turns || 'N/A'} tokens` : 
      result.error;
    console.log(`${status} ${result.name}: ${result.success ? '成功' : '失败'} - ${message}`);
  });

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
  testBasicMessage,
  testMultiTurnConversation,
  testCreativeWriting,
  testCodeGeneration,
  testSystemMessage,
  testComplexReasoning,
  testMultilingual,
  main
};
