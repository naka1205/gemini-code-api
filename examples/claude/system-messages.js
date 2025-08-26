/**
 * Claude 系统消息示例
 */
const { makeClaudeRequest, withPerformanceMonitoring, Logger, saveResponse, delay } = require('../utils');
const { config } = require('../config');
const logger = new Logger('claude-system');

async function testSystemMessages() {
  try {
    const model = config.models.claude.default;
    const messages = [
      { role: 'system', content: '你是一名严谨的技术文档撰写助手，请输出简明、分点、无废话。' },
      { role: 'user', content: '请为一个前后端分离的电商网站撰写README的大纲。' },
    ];
    const r = await makeClaudeRequest(model, messages, { max_tokens: 700, temperature: 0.4 });
    await saveResponse('claude-system-messages', { outline: r.text || r }, {
      // 请求详情
    });
    return { success: true };
  } catch (e) {
    logger.error('系统消息示例失败:', e);
    return { success: false, error: e.message };
  }
}

async function main() {
  logger.info('=== Claude 系统消息示例开始 ===');
  const result = await withPerformanceMonitoring(testSystemMessages, '系统消息');
  await delay(200);
  return result;
}

if (require.main === module) {
  main().catch(err => { logger.error(err); process.exit(1); });
}

module.exports = { testSystemMessages, main };
