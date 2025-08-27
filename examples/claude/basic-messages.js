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
 * 主函数 - 只运行基础消息测试
 */
async function main() {
  logger.info('🚀 开始运行 Claude 基础消息示例');
  
  // 只运行基础消息测试，输出 claude-基础消息.json
  const result = await withPerformanceMonitoring(testBasicMessage, '基础消息')();
  
  // 输出测试结果
  console.log('\n📊 测试结果:');
  console.log('─'.repeat(50));
  const status = result.success ? '✅' : '❌';
  const message = result.success ? 
    `${result.responseLength || 'N/A'} tokens` : 
    result.error;
  console.log(`${status} 基础消息: ${result.success ? '成功' : '失败'} - ${message}`);

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
  testBasicMessage,
  main
};
