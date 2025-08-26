/**
 * Claude 多轮对话示例（非流式）
 */
const { makeClaudeRequest, withPerformanceMonitoring, Logger, saveResponse, delay } = require('../utils');
const { config } = require('../config');
const logger = new Logger('claude-multi-turn');

async function testMultiTurn() {
  try {
    const model = config.models.claude.default;
    const history = [
      { role: 'user', content: '请帮我起草一封申请远程办公的英文邮件，先给出结构。' },
    ];
    const r1 = await makeClaudeRequest(model, history, { max_tokens: 600, temperature: 0.5 });
    history.push({ role: 'assistant', content: r1.text || r1 });

    history.push({ role: 'user', content: '加入一段关于跨时区协作的说明，并保持礼貌专业。' });
    const r2 = await makeClaudeRequest(model, history, { max_tokens: 700, temperature: 0.5 });

    await saveResponse('claude-multi-turn', { turn1: r1.text || r1, turn2: r2.text || r2 }, {
      // 请求详情
    });
    return { success: true, turns: 2 };
  } catch (e) {
    logger.error('多轮对话失败:', e);
    return { success: false, error: e.message };
  }
}

async function main() {
  logger.info('=== Claude 多轮对话示例开始 ===');
  const result = await withPerformanceMonitoring(testMultiTurn, '多轮对话');
  await delay(200);
  return result;
}

if (require.main === module) {
  main().catch(err => { logger.error(err); process.exit(1); });
}

module.exports = { testMultiTurn, main };
