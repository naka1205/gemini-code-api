/**
 * Gemini 图片上传和理解示例
 * 演示图片分析、描述和基于图片的对话功能
 * 
 * @author Gemini Code Team
 * @date 2024-12-19
 */

const { config, validateConfig, getModelConfig } = require('../config');
const { 
  makeGeminiRequest, 
  saveResponse, 
  validateResponse, 
  withPerformanceMonitoring,
  readTestImage,
  Logger 
} = require('../utils');

const logger = new Logger('Gemini-ImageUpload');

/**
 * 基础图片描述测试
 */
async function testImageDescription() {
  const model = getModelConfig('gemini', 'vision');
  
  logger.info('开始图片描述测试', { model });
  
  // 使用一个示例图片（这里使用一个简单的占位符）
  // 在实际使用中，你需要提供一个真实的图片文件
  const { data: descImageData, mimeType: descMime } = await readTestImage('sample-image.png');
  
  const contents = [
    {
      role: 'user',
      parts: [
        { text: '请详细描述这张图片的内容，包括你看到的所有细节。' },
        {
          inlineData: {
            mimeType: descMime,
            data: descImageData
          }
        }
      ]
    }
  ];
  
  const generationConfig = {
    temperature: 0.4,
    maxOutputTokens: 1024,
  };
  
  const response = await makeGeminiRequest(model, contents, {
    generationConfig,
  });
  
  validateResponse(response, ['candidates']);
  
  const candidate = response.candidates[0];
  const content = candidate.content.parts[0].text;
  
  logger.success('图片描述测试成功', {
    model,
    responseLength: content.length,
    tokenUsage: response.usageMetadata,
  });
  
  console.log('\n🖼️  图片描述结果:');
  console.log('─'.repeat(50));
  console.log(content);
  console.log('─'.repeat(50));
  
  return { response, content };
}

/**
 * 图片内容分析测试
 */
async function testImageAnalysis() {
  const model = getModelConfig('gemini', 'vision');
  
  logger.info('开始图片内容分析测试', { model });
  
  const { data: analysisImageData, mimeType: analysisMime } = await readTestImage('analysis-image.png');
  
  const prompt = `请分析这张图片，并提供以下信息：
1. 图片的主要内容和主题
2. 图片中的关键元素和对象
3. 图片的风格和构图特点
4. 图片可能传达的信息或情感
5. 如果是图表或数据可视化，请解释数据的含义`;
  
  const contents = [
    {
      role: 'user',
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType: analysisMime,
            data: analysisImageData
          }
        }
      ]
    }
  ];
  
  const generationConfig = {
    temperature: 0.3,
    maxOutputTokens: 2048,
  };
  
  const response = await makeGeminiRequest(model, contents, {
    generationConfig,
  });
  
  validateResponse(response, ['candidates']);
  
  const candidate = response.candidates[0];
  const content = candidate.content.parts[0].text;
  
  logger.success('图片内容分析测试成功', {
    model,
    responseLength: content.length,
    tokenUsage: response.usageMetadata,
  });
  
  console.log('\n🔍 图片分析结果:');
  console.log('─'.repeat(50));
  console.log(content);
  console.log('─'.repeat(50));
  
  return { response, content };
}

/**
 * 基于图片的问答测试
 */
async function testImageQnA() {
  const model = getModelConfig('gemini', 'vision');
  
  logger.info('开始基于图片的问答测试', { model });
  
  const { data: qnaImageData, mimeType: qnaMime } = await readTestImage('qna-image.png');
  try {
    const { saveBase64Image } = require('../utils');
    await saveBase64Image('qna-image.png', qnaImageData);
  } catch {}
  
  const questions = [
    '这张图片中有什么？',
    '图片中的主要颜色是什么？',
    '这张图片是在什么环境下拍摄的？',
    '图片中有什么文字或符号吗？',
    '这张图片给你什么感觉？'
  ];
  
  const results = [];
  
  for (const question of questions) {
    logger.info(`处理问题: ${question}`);
    
    const contents = [
      {
        role: 'user',
        parts: [
          { text: question },
          {
            inlineData: {
              mimeType: qnaMime,
              data: qnaImageData
            }
          }
        ]
      }
    ];
    
    const generationConfig = {
      temperature: 0.5,
      maxOutputTokens: 512,
    };
    
    const response = await makeGeminiRequest(model, contents, {
      generationConfig,
    });
    
    validateResponse(response, ['candidates']);
    
    const candidate = response.candidates[0];
    const content = candidate.content.parts[0].text;
    
    results.push({
      question,
      answer: content,
      tokenUsage: response.usageMetadata,
    });
    
    // 问题间隔
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  logger.success('基于图片的问答测试成功', {
    model,
    questionCount: questions.length,
  });
  
  console.log('\n❓ 图片问答结果:');
  console.log('─'.repeat(50));
  
  for (const result of results) {
    console.log(`\n问题: ${result.question}`);
    console.log(`回答: ${result.answer}`);
    console.log(`Token 使用: ${result.tokenUsage?.totalTokenCount || 0}`);
  }
  
  console.log('─'.repeat(50));
  
  return { results };
}

/**
 * 多图片比较测试
 */
async function testMultiImageComparison() {
  const model = getModelConfig('gemini', 'vision');
  
  logger.info('开始多图片比较测试', { model });
  
  const [img1, img2] = await (async () => {
    try {
      const { readTwoTestImages } = require('../utils');
      return await readTwoTestImages('image1.jpg', 'image2.jpg');
    } catch (e) {
      // 兼容旧路径：逐个读取，失败时由 readTestImage 内部回退
      const a = await readTestImage('image1.jpg');
      const b = await readTestImage('image2.jpg');
      return [a, b];
    }
  })();
  
  const contents = [
    {
      role: 'user',
      parts: [
        { text: '请比较这两张图片，分析它们的相似之处和不同之处。' },
        {
          inlineData: {
            mimeType: (img1.mimeType || 'image/jpeg'),
            data: (img1.data || img1)
          }
        },
        {
          inlineData: {
            mimeType: (img2.mimeType || 'image/jpeg'),
            data: (img2.data || img2)
          }
        }
      ]
    }
  ];
  
  const generationConfig = {
    temperature: 0.4,
    maxOutputTokens: 2048,
  };
  
  const response = await makeGeminiRequest(model, contents, {
    generationConfig,
  });
  
  validateResponse(response, ['candidates']);
  
  const candidate = response.candidates[0];
  const content = candidate.content.parts[0].text;
  
  logger.success('多图片比较测试成功', {
    model,
    responseLength: content.length,
    tokenUsage: response.usageMetadata,
  });
  
  console.log('\n🔄 图片比较结果:');
  console.log('─'.repeat(50));
  console.log(content);
  console.log('─'.repeat(50));
  
  return { response, content };
}

/**
 * 图片创意生成测试
 */
async function testImageCreativeGeneration() {
  const model = getModelConfig('gemini', 'vision');
  
  logger.info('开始图片创意生成测试', { model });
  
  const { data: creativeImageData, mimeType: creativeMime } = await readTestImage('creative-image.png');
  
  const prompt = `基于这张图片，请：
1. 创作一个短篇故事（200-300字）
2. 写一首诗来描述图片的意境
3. 提出3个创意想法，说明如何利用这张图片进行创作
4. 想象这张图片背后的故事或历史背景`;
  
  const contents = [
    {
      role: 'user',
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType: creativeMime,
            data: creativeImageData
          }
        }
      ]
    }
  ];
  
  const generationConfig = {
    temperature: 0.8, // 高温度值增加创意性
    maxOutputTokens: 2048,
  };
  
  const response = await makeGeminiRequest(model, contents, {
    generationConfig,
  });
  
  validateResponse(response, ['candidates']);
  
  const candidate = response.candidates[0];
  const content = candidate.content.parts[0].text;
  
  logger.success('图片创意生成测试成功', {
    model,
    responseLength: content.length,
    tokenUsage: response.usageMetadata,
  });
  
  console.log('\n🎨 创意生成结果:');
  console.log('─'.repeat(50));
  console.log(content);
  console.log('─'.repeat(50));
  
  return { response, content };
}

/**
 * 图片技术分析测试
 */
async function testImageTechnicalAnalysis() {
  const model = getModelConfig('gemini', 'vision');
  
  logger.info('开始图片技术分析测试', { model });
  
  const { data: technicalImageData, mimeType: technicalMime } = await readTestImage('technical-image.png');
  
  const prompt = `请从技术角度分析这张图片：
1. 图片的分辨率和质量
2. 使用的摄影技术或制作方法
3. 光线和色彩处理
4. 构图和视觉元素
5. 如果是数字图像，分析其技术特征
6. 可能的拍摄设备或软件`;
  
  const contents = [
    {
      role: 'user',
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType: technicalMime,
            data: technicalImageData
          }
        }
      ]
    }
  ];
  
  const generationConfig = {
    temperature: 0.2, // 低温度值确保技术分析的准确性
    maxOutputTokens: 2048,
  };
  
  const response = await makeGeminiRequest(model, contents, {
    generationConfig,
  });
  
  validateResponse(response, ['candidates']);
  
  const candidate = response.candidates[0];
  const content = candidate.content.parts[0].text;
  
  logger.success('图片技术分析测试成功', {
    model,
    responseLength: content.length,
    tokenUsage: response.usageMetadata,
  });
  
  console.log('\n🔧 技术分析结果:');
  console.log('─'.repeat(50));
  console.log(content);
  console.log('─'.repeat(50));
  
  return { response, content };
}

/**
 * 主函数
 */
async function main() {
  try {
    logger.info('🚀 开始运行 Gemini 图片上传和理解示例');
    
    // 验证配置
    validateConfig();
    
    // 运行各种测试
    const tests = [
      { name: '图片描述', fn: testImageDescription },
      { name: '图片分析', fn: testImageAnalysis },
      { name: '图片问答', fn: testImageQnA },
      { name: '多图片比较', fn: testMultiImageComparison },
      { name: '创意生成', fn: testImageCreativeGeneration },
      { name: '技术分析', fn: testImageTechnicalAnalysis },
    ];
    
    const results = {};
    
    for (const test of tests) {
      logger.info(`开始测试: ${test.name}`);
      
      try {
        const result = await withPerformanceMonitoring(test.fn, test.name)();
        results[test.name] = result;
        
        // 保存响应（如果启用）
        await saveResponse(`gemini-${test.name}`, result.response || result, {
          model: getModelConfig('gemini', 'vision'),
          testType: test.name,
        });
        
        // 测试间隔
        if (test !== tests[tests.length - 1]) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        logger.error(`${test.name} 测试失败`, error);
        results[test.name] = { error: error.message };
      }
    }
    
    // 输出总结
    console.log('\n📊 测试总结:');
    console.log('─'.repeat(50));
    
    for (const [testName, result] of Object.entries(results)) {
      if (result.error) {
        console.log(`❌ ${testName}: 失败 - ${result.error}`);
      } else {
        const tokenCount = result.response?.usageMetadata?.totalTokenCount || 
                          (result.results ? result.results.reduce((sum, r) => sum + (r.tokenUsage?.totalTokenCount || 0), 0) : 0);
        console.log(`✅ ${testName}: 成功 - ${tokenCount} tokens`);
      }
    }
    
    logger.success('所有测试完成');
    
  } catch (error) {
    logger.error('示例运行失败', error);
    process.exit(1);
  }
}

// 如果直接运行此文件，则执行主函数
if (require.main === module) {
  main();
}

module.exports = {
  main,
  testImageDescription,
  testImageAnalysis,
  testImageQnA,
  testMultiImageComparison,
  testImageCreativeGeneration,
  testImageTechnicalAnalysis,
};
