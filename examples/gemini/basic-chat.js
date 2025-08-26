/**
 * Gemini 基础对话示例
 * 展示基本的对话功能
 */

const { makeGeminiRequest, saveResponse, withPerformanceMonitoring, delay, Logger } = require('../utils');
const { config } = require('../config');

const logger = new Logger('Gemini-BasicChat');

/**
 * 基础对话测试
 */
async function testBasicChat() {
  logger.info('开始基础对话测试', { 
    model: config.models.gemini.default, 
    prompt: '你好，请介绍一下你自己，并说明你能做什么？请直接输出最终答案正文，不要输出任何分析、提纲或思考过程。' 
  });
  
  try {
    const contents = [{
      role: 'user',
      parts: [{ text: '你好，请介绍一下你自己，并说明你能做什么？请直接输出最终答案正文，不要输出任何分析、提纲或思考过程。' }]
    }];

    const response = await makeGeminiRequest(config.models.gemini.default, contents, {
      temperature: 0.7,
      maxOutputTokens: 2048
    });

    const parts = response.candidates?.[0]?.content?.parts || [];
    let responseText = parts
      .filter((p) => p?.text && p?.thought !== true)
      .map((p) => p.text)
      .join('');
    if (!responseText || responseText.trim().length === 0) {
      const fallback = response?.text;
      if (typeof fallback === 'string' && fallback.trim().length > 0) {
        responseText = fallback;
      }
    }
    if (!responseText || responseText.trim().length === 0) {
      const thoughtOnly = parts
        .filter((p) => p?.text && p?.thought === true)
        .map((p) => p.text)
        .join('');
      if (thoughtOnly && thoughtOnly.trim().length > 0) responseText = thoughtOnly;
    }
    if (!responseText || responseText.trim().length === 0) responseText = '无响应内容';
    const responseLength = responseText.length;

    logger.success('基础对话测试成功', {
      model: config.models.gemini.default,
      responseLength,
      tokenUsage: response.usageMetadata
    });

    console.log('\n📝 基础对话结果:');
    console.log('─'.repeat(50));
    console.log(responseText);
    console.log('─'.repeat(50));

    await saveResponse('gemini-基础对话', response, { 
      model: config.models.gemini.default,
      testType: '基础对话'
    });

    return { success: true, responseLength, tokenUsage: response.usageMetadata };
  } catch (error) {
    logger.error('基础对话测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 多轮对话测试
 */
async function testMultiTurnChat() {
  logger.info('开始多轮对话测试', { model: config.models.gemini.default });
  
  try {
    const conversation = [
      { role: 'user', parts: [{ text: '你好，我想了解机器学习的基本概念。请用不超过150字简要回答，仅输出正文。' }] }
    ];

    // 第一轮对话
    logger.info('第一轮对话');
    const response1 = await makeGeminiRequest(config.models.gemini.default, conversation, {
      maxOutputTokens: 2048,
      thinking: { type: 'disabled' },
      stopSequences: ['\n\nEND']
    });

    const parts1 = response1.candidates?.[0]?.content?.parts || [];
    let response1Text = parts1
      .filter((p) => p?.text && p?.thought !== true)
      .map((p) => p.text)
      .join('');
    if (!response1Text || response1Text.trim().length === 0) {
      const fallback1 = response1?.text;
      if (typeof fallback1 === 'string' && fallback1.trim().length > 0) {
        response1Text = fallback1;
      }
    }
    if (!response1Text || response1Text.trim().length === 0) {
      const thoughtOnly1 = parts1
        .filter((p) => p?.text && p?.thought === true)
        .map((p) => p.text)
        .join('');
      if (thoughtOnly1 && thoughtOnly1.trim().length > 0) response1Text = thoughtOnly1;
    }
    if (!response1Text || response1Text.trim().length === 0) response1Text = '无响应内容';
    conversation.push({ role: 'model', parts: [{ text: response1Text }] });

    // 添加延迟，避免过快请求
    await delay(2000);

    // 第二轮对话
    logger.info('第二轮对话');
    conversation.push({ role: 'user', parts: [{ text: '能详细解释一下监督学习和无监督学习的区别吗？请给出要点对比，控制在200字内，仅输出正文。' }] });

    const response2 = await makeGeminiRequest(config.models.gemini.default, conversation, {
      maxOutputTokens: 3072,
      thinking: { type: 'disabled' },
      stopSequences: ['\n\nEND']
    });

    const parts2 = response2.candidates?.[0]?.content?.parts || [];
    let response2Text = parts2
      .filter((p) => p?.text && p?.thought !== true)
      .map((p) => p.text)
      .join('');
    if (!response2Text || response2Text.trim().length === 0) {
      const fallback2 = response2?.text;
      if (typeof fallback2 === 'string' && fallback2.trim().length > 0) {
        response2Text = fallback2;
      }
    }
    if (!response2Text || response2Text.trim().length === 0) {
      const thoughtOnly2 = parts2
        .filter((p) => p?.text && p?.thought === true)
        .map((p) => p.text)
        .join('');
      if (thoughtOnly2 && thoughtOnly2.trim().length > 0) response2Text = thoughtOnly2;
    }
    if (!response2Text || response2Text.trim().length === 0) response2Text = '无响应内容';

    logger.success('多轮对话测试成功', {
      model: config.models.gemini.default,
      turns: 2,
      totalLength: response1Text.length + response2Text.length
    });

    await saveResponse('gemini-多轮对话', { response1, response2 }, { 
      conversation,
      model: config.models.gemini.default
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
  logger.info('开始创意写作测试', { model: config.models.gemini.default });
  
  try {
    const contents = [{
      role: 'user',
      parts: [{ text: '请写一个300-500字的短篇科幻故事，主题是人工智能。要求有令人印象深刻的转折，语言生动有趣。只输出完整的故事正文，不要输出任何分析、提纲或思考过程，也不要添加任何标签。' }]
    }];

    const response = await makeGeminiRequest(config.models.gemini.default, contents, {
      temperature: 0.8,
      maxOutputTokens: 4096,
      thinking: { type: 'disabled' }
    });

    const partsA = response.candidates?.[0]?.content?.parts || [];
    const allTextA = (partsA.filter(p=>p?.text).map(p=>p.text).join('')) || '';
    let responseTextA = '';
    if (!responseTextA) {
      responseTextA = partsA
        .filter((p) => p?.text && p?.thought !== true)
        .map((p) => p.text)
        .join('');
    }
    if (!responseTextA || responseTextA.trim().length === 0) {
      const fallbackA = response?.text;
      if (typeof fallbackA === 'string' && fallbackA.trim().length > 0) {
        responseTextA = fallbackA;
      }
    }
    if (!responseTextA || responseTextA.trim().length === 0) {
      const thoughtOnlyA = partsA
        .filter((p) => p?.text && p?.thought === true)
        .map((p) => p.text)
        .join('');
      if (thoughtOnlyA && thoughtOnlyA.trim().length > 0) responseTextA = thoughtOnlyA;
    }
    const responseText = responseTextA && responseTextA.trim().length > 0 ? responseTextA : '无响应内容';
    const responseLength = responseText.length;

    logger.success('创意写作测试成功', {
      model: config.models.gemini.pro,
      responseLength,
      tokenUsage: response.usageMetadata
    });

    console.log('\n📝 创意写作结果:');
    console.log('─'.repeat(50));
    console.log(responseText);
    console.log('─'.repeat(50));

    // 保存时提供规范化文本与原始响应，便于判定是否为正文
    await saveResponse('gemini-创意写作', {
      text: responseText,
      raw: response
    }, { 
      model: config.models.gemini.default,
      testType: '创意写作'
    });

    return { success: true, responseLength, tokenUsage: response.usageMetadata };
  } catch (error) {
    logger.error('创意写作测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 代码生成测试
 */
async function testCodeGeneration() {
  logger.info('开始代码生成测试', { model: config.models.gemini.default });
  
  try {
    const contents = [{
      role: 'user',
      parts: [{ text: '请用JavaScript编写一个函数，实现快速排序算法，并添加详细的注释说明。只输出完整可运行的代码，不要输出任何解释、分析或思考过程。' }]
    }];

    const response = await makeGeminiRequest(config.models.gemini.default, contents, {
      temperature: 0.3,
      maxOutputTokens: 3072,
      thinking: { type: 'disabled' },
      stopSequences: ['\n// END']
    });

    const partsB = response.candidates?.[0]?.content?.parts || [];
    let responseTextB = partsB
      .filter((p) => p?.text && p?.thought !== true)
      .map((p) => p.text)
      .join('');
    if (!responseTextB || responseTextB.trim().length === 0) {
      const fallbackB = response?.text;
      if (typeof fallbackB === 'string' && fallbackB.trim().length > 0) {
        responseTextB = fallbackB;
      }
    }
    if (!responseTextB || responseTextB.trim().length === 0) {
      const thoughtOnlyB = partsB
        .filter((p) => p?.text && p?.thought === true)
        .map((p) => p.text)
        .join('');
      if (thoughtOnlyB && thoughtOnlyB.trim().length > 0) responseTextB = thoughtOnlyB;
    }
    const responseText = responseTextB && responseTextB.trim().length > 0 ? responseTextB : '无响应内容';
    const responseLength = responseText.length;

    logger.success('代码生成测试成功', {
      model: config.models.gemini.default,
      responseLength,
      tokenUsage: response.usageMetadata
    });

    await saveResponse('gemini-代码生成', response, { 
      model: config.models.gemini.default,
      testType: '代码生成'
    });

    return { success: true, responseLength, tokenUsage: response.usageMetadata };
  } catch (error) {
    logger.error('代码生成测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 思考推理演示（2.5 模型）
 */
async function testThinkingDemo() {
  logger.info('开始思考推理演示', { model: config.models.gemini.default });
  try {
    const maxOutputTokens = 1024;
    const budget = Math.min(1024, Math.floor(maxOutputTokens * 0.33));
    const contents = [{
      role: 'user',
      parts: [{ text: '请一步步推理 17+28 的过程，并给出最终答案。先思考后输出。' }]
    }];

    const response = await makeGeminiRequest(config.models.gemini.default, contents, {
      temperature: 0.2,
      maxOutputTokens,
      thinking: { type: 'enabled', budget_tokens: budget },
    });

    const parts = response.candidates?.[0]?.content?.parts || [];
    const thoughts = parts.filter(p => p?.text && p?.thought === true).map(p => p.text).join('\n');
    const text = parts.filter(p => p?.text && p?.thought !== true).map(p => p.text).join('\n');

    console.log('\n🧠 思考推理演示:');
    console.log('─'.repeat(50));
    console.log('【Thoughts】');
    console.log(thoughts || '[no thoughts parts]');
    console.log('\n【Final Answer】');
    console.log(text || '[no text parts]');
    console.log('─'.repeat(50));

    await saveResponse('gemini-思考演示', {
      thoughts,
      text,
      raw: response,
    }, {
      model: config.models.gemini.default,
      testType: '思考演示',
      maxOutputTokens,
      thinkingBudget: budget,
    });

    return { success: true, responseLength: (text || '').length, tokenUsage: response.usageMetadata };
  } catch (error) {
    logger.error('思考推理演示失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 主函数
 */
async function main() {
  logger.info('🚀 开始运行 Gemini 基础对话示例');
  
  const results = [];
  
  // 运行所有测试，每个测试之间添加延迟
  const tests = [
    { name: '基础对话', fn: testBasicChat },
    { name: '多轮对话', fn: testMultiTurnChat },
    { name: '创意写作', fn: testCreativeWriting },
    { name: '代码生成', fn: testCodeGeneration },
    { name: '思考演示', fn: testThinkingDemo }
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
  testBasicChat,
  testMultiTurnChat,
  testCreativeWriting,
  testCodeGeneration,
  testThinkingDemo,
  main
};
