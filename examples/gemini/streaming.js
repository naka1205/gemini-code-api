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
    await saveResponse('gemini-流式响应', { response: fullResponse, chunkCount }, {
      model,
      testType: '流式响应'
    });
    
    return { success: true, chunkCount, responseLength: fullResponse.length };
  } catch (error) {
    logger.error('流式响应测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 主函数
 */
async function main() {
  logger.info('🚀 开始运行 Gemini 流式响应示例');
  
  const result = await withPerformanceMonitoring(testBasicStreaming, '流式响应')();
  
  // 输出测试结果
  console.log('\n📊 测试结果:');
  console.log('─'.repeat(50));
  const status = result.success ? '✅' : '❌';
  const message = result.success ? 
    `${result.chunkCount || 'N/A'} chunks, ${result.responseLength || 'N/A'} chars` : 
    result.error;
  console.log(`${status} 流式响应: ${result.success ? '成功' : '失败'} - ${message}`);

  return result;
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
  main
};