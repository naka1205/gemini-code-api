/**
 * OpenAI 基础对话示例
 * 展示基本的对话功能
 */

const { makeOpenAIRequest, saveResponse, withPerformanceMonitoring, Logger } = require('../utils');
const { config } = require('../config');

const logger = new Logger('OpenAI-BasicChat');

/**
 * 基础对话测试
 */
async function testBasicChat() {
  const model = config.models.openai.default;
  logger.info('开始基础对话测试', { 
    model,
    prompt: '你好，请介绍一下你自己，并说明你能做什么？' 
  });
  
  try {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: '你好，请介绍一下你自己，并说明你能做什么？' }
    ];

    const response = await makeOpenAIRequest(model, messages, {
      temperature: 0.7,
      max_tokens: 1024,
    });

    const responseText = response.choices[0]?.message?.content || '无响应内容';
    const responseLength = responseText.length;

    logger.success('基础对话测试成功', {
      model,
      responseLength,
      tokenUsage: response.usage
    });

    console.log('\n📝 基础对话结果:');
    console.log('─'.repeat(50));
    console.log(responseText);
    console.log('─'.repeat(50));

    await saveResponse('openai-基础对话', response, { 
      model,
      testType: '基础对话'
    });

    return { success: true, responseLength, tokenUsage: response.usage };
  } catch (error) {
    logger.error('基础对话测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 主函数
 */
async function main() {
  logger.info('🚀 开始运行 OpenAI 基础对话示例');
  
  const result = await withPerformanceMonitoring(testBasicChat, '基础对话')();
  
  console.log('\n📊 测试结果:');
  console.log('─'.repeat(50));
  const status = result.success ? '✅' : '❌';
  const message = result.success ? 
    `长度: ${result.responseLength || 'N/A'}` : 
    result.error;
  console.log(`${status} 基础对话: ${result.success ? '成功' : '失败'} - ${message}`);

  return result;
}

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
