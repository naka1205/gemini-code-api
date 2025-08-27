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
 * 主函数 - 只运行基础对话测试
 */
async function main() {
  logger.info('🚀 开始运行 Gemini 基础对话示例');
  
  // 只运行基础对话测试，输出 gemini-基础对话.json
  const result = await withPerformanceMonitoring(testBasicChat, '基础对话')();
  
  // 输出测试结果
  console.log('\n📊 测试结果:');
  console.log('─'.repeat(50));
  const status = result.success ? '✅' : '❌';
  const message = result.success ? 
    `${result.responseLength || 'N/A'} tokens` : 
    result.error;
  console.log(`${status} 基础对话: ${result.success ? '成功' : '失败'} - ${message}`);

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
  testBasicChat,
  main
};
