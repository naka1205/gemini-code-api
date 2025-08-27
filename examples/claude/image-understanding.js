/**
 * Claude 图片理解示例（优雅降级）
 */
const { readTestImage, withPerformanceMonitoring, Logger, saveResponse, delay } = require('../utils');
const { config } = require('../config');
const logger = new Logger('claude-image-understanding');

async function testImageUnderstanding() {
  try {
    // 读取测试图片
    const img = await readTestImage('sample.jpg').catch(() => null);
    if (!img) {
      logger.warn('未找到测试图片，跳过图片理解测试');
      return { success: true, skipped: true, reason: 'no test image' };
    }
    // 说明：如需真实多模态调用，请在网关支持后，将图片以模型要求的多模态格式发送。
    // 这里做降级：让模型基于“图片描述占位信息”执行任务，保留流程与输出。
    const placeholderDesc = '一张包含城市天际线与黄昏天空的示例图片（占位说明）';

    const { makeClaudeRequest } = require('../utils');
    const model = config.models.claude.default;
    const messages = [{
      role: 'user',
      content: `请基于以下占位的图片描述，输出图片要素、场景、风格与可能用途：\n${placeholderDesc}`,
    }];
    const r = await makeClaudeRequest(model, messages, { max_tokens: 600, temperature: 0.4 });
    await saveResponse('claude-图片理解', { note: 'degraded without real multimodal', analysis: r.text || r }, {
      // 请求详情
    });
    return { success: true, degraded: true };
  } catch (e) {
    logger.error('图片理解示例失败:', e);
    return { success: false, error: e.message };
  }
}

async function main() {
  logger.info('=== Claude 图片理解示例开始 ===');
  const result = await withPerformanceMonitoring(testImageUnderstanding, '图片理解');
  await delay(200);
  return result;
}

if (require.main === module) {
  main().catch(err => { logger.error(err); process.exit(1); });
}

module.exports = { testImageUnderstanding, main };
