/**
 * Gemini 流式响应示例
 * 展示实时流式对话功能
 */

const { makeGeminiRequest, saveResponse, withPerformanceMonitoring, delay, Logger } = require('../utils');
const { config } = require('../config');

const logger = new Logger('gemini-streaming');

/**
 * 基础流式对话
 */
async function testBasicStreaming() {
  logger.info('开始测试基础流式对话');
  
  try {
    const model = config.models.gemini.default;
    const contents = [{
      role: 'user',
      parts: [{
        text: '请用流式方式讲述一个关于人工智能发展的故事，每句话都要停顿一下。'
      }]
    }];

    const response = await makeGeminiRequest(model, contents, {
      stream: true,
      maxOutputTokens: 1000,
      temperature: 0.7
    });

    logger.info('流式响应开始');
    let fullResponse = '';
    let chunkCount = 0;

    for await (const chunk of response.body) {
      chunkCount++;
      const text = new TextDecoder().decode(chunk);
      process.stdout.write(text);
      fullResponse += text;
      
      // 模拟实时效果
      await delay(50);
    }

    logger.info(`流式响应完成，共接收 ${chunkCount} 个数据块`);
    await saveResponse('gemini-streaming-basic', { response: fullResponse, chunkCount }, {});
    
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
    const model = config.models.gemini.default;
    const conversation = [
      {
        role: 'user',
        parts: [{ text: '你好，我想了解机器学习的基本概念。' }]
      }
    ];

    // 第一轮对话
    logger.info('第一轮对话');
    const response1 = await makeGeminiRequest(model, conversation, {
      stream: true,
      maxOutputTokens: 500
    });

    let response1Text = '';
    for await (const chunk of response1.body) {
      const text = new TextDecoder().decode(chunk);
      process.stdout.write(text);
      response1Text += text;
      await delay(30);
    }

    // 添加第一轮回复到对话历史
    conversation.push({
      role: 'model',
      parts: [{ text: response1Text }]
    });

    // 第二轮对话
    logger.info('\n第二轮对话');
    conversation.push({
      role: 'user',
      parts: [{ text: '能详细解释一下监督学习和无监督学习的区别吗？' }]
    });

    const response2 = await makeGeminiRequest(model, conversation, {
      stream: true,
      maxOutputTokens: 600
    });

    let response2Text = '';
    for await (const chunk of response2.body) {
      const text = new TextDecoder().decode(chunk);
      process.stdout.write(text);
      response2Text += text;
      await delay(30);
    }

    logger.info('多轮流式对话完成');
    await saveResponse('gemini-streaming-multi-turn', {
      conversation,
      response1: response1Text,
      response2: response2Text
    }, {});

    return { success: true, turns: 2 };
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
    const model = config.models.gemini.default;
    const contents = [{
      role: 'user',
      parts: [{
        text: '请用流式方式生成一个 Python 函数，用于计算斐波那契数列，并添加详细的中文注释。'
      }]
    }];

    const response = await makeGeminiRequest(model, contents, {
      stream: true,
      maxOutputTokens: 800,
      temperature: 0.3
    });

    logger.info('开始流式生成代码');
    let fullCode = '';
    let lineCount = 0;

    for await (const chunk of response.body) {
      const text = new TextDecoder().decode(chunk);
      process.stdout.write(text);
      fullCode += text;
      
      // 统计代码行数
      if (text.includes('\n')) {
        lineCount += (text.match(/\n/g) || []).length;
      }
      
      await delay(40);
    }

    logger.info(`流式代码生成完成，共 ${lineCount} 行代码`);
    await saveResponse('gemini-streaming-code', { code: fullCode, lineCount }, {
      // 请求详情
    });
    
    return { success: true, lineCount, codeLength: fullCode.length };
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
    const model = config.models.gemini.default;
    const contents = [{
      role: 'user',
      parts: [{
        text: '请用流式方式创作一个科幻短故事，主题是"时间旅行者的选择"，要求情节紧凑，富有想象力。'
      }]
    }];

    const response = await makeGeminiRequest(model, contents, {
      stream: true,
      maxOutputTokens: 1200,
      temperature: 0.8
    });

    logger.info('开始流式创作故事');
    let fullStory = '';
    let paragraphCount = 0;

    for await (const chunk of response.body) {
      const text = new TextDecoder().decode(chunk);
      process.stdout.write(text);
      fullStory += text;
      
      // 统计段落数
      if (text.includes('\n\n')) {
        paragraphCount += (text.match(/\n\n/g) || []).length;
      }
      
      await delay(60);
    }

    logger.info(`流式创意写作完成，共 ${paragraphCount} 个段落`);
    await saveResponse('gemini-streaming-creative', { story: fullStory, paragraphCount }, {
      // 请求详情
    });
    
    return { success: true, paragraphCount, storyLength: fullStory.length };
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
    const model = config.models.gemini.default;
    const longText = `
    人工智能（Artificial Intelligence，AI）是计算机科学的一个分支，它企图了解智能的实质，
    并生产出一种新的能以人类智能相似的方式做出反应的智能机器。该领域的研究包括机器人、
    语言识别、图像识别、自然语言处理和专家系统等。人工智能从诞生以来，理论和技术日益成熟，
    应用领域也不断扩大，可以设想，未来人工智能带来的科技产品，将会是人类智慧的"容器"。
    `;

    const contents = [{
      role: 'user',
      parts: [{
        text: `请将以下中文文本翻译成英文，使用流式输出：\n\n${longText}`
      }]
    }];

    const response = await makeGeminiRequest(model, contents, {
      stream: true,
      maxOutputTokens: 1000,
      temperature: 0.2
    });

    logger.info('开始流式翻译');
    let fullTranslation = '';
    let wordCount = 0;

    for await (const chunk of response.body) {
      const text = new TextDecoder().decode(chunk);
      process.stdout.write(text);
      fullTranslation += text;
      
      // 统计英文单词数
      const words = text.match(/\b[a-zA-Z]+\b/g) || [];
      wordCount += words.length;
      
      await delay(50);
    }

    logger.info(`流式翻译完成，共翻译 ${wordCount} 个英文单词`);
    await saveResponse('gemini-streaming-translation', {
      original: longText,
      translation: fullTranslation,
      wordCount
    }, {
      // 请求详情
    });
    
    return { success: true, wordCount, translationLength: fullTranslation.length };
  } catch (error) {
    logger.error('流式实时翻译测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 主函数
 */
async function main() {
  logger.info('=== Gemini 流式响应示例开始 ===');
  
  const results = [];
  
  // 运行所有测试
  const tests = [
    { name: '基础流式对话', fn: testBasicStreaming },
    { name: '多轮流式对话', fn: testMultiTurnStreaming },
    { name: '流式代码生成', fn: testStreamingCodeGeneration },
    { name: '流式创意写作', fn: testStreamingCreativeWriting },
    { name: '流式实时翻译', fn: testStreamingTranslation }
  ];

  for (const test of tests) {
    logger.info(`\n--- 开始测试: ${test.name} ---`);
    const result = await withPerformanceMonitoring(test.fn, test.name)();
    results.push({ name: test.name, ...result });
    
    // 测试间隔
    await delay(2000);
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
  main
};
