/**
 * Gemini 图片分析合集包装器
 * 仅串行运行并保存以下4类响应：
 * - gemini-图片分析.json
 * - gemini-多图片比较.json
 * - gemini-创意生成.json
 * - gemini-技术分析.json
 */

const {
  testImageAnalysis,
  testMultiImageComparison,
  testImageCreativeGeneration,
  testImageTechnicalAnalysis,
} = require('./image-upload');

const { withPerformanceMonitoring, delay, Logger, saveResponse } = require('../utils');
const { getModelConfig } = require('../config');

const logger = new Logger('gemini-image-analysis-suite');

async function main() {
  logger.info('=== 开始运行 图片分析 合集示例 ===');
  const model = getModelConfig('gemini', 'vision');

  const steps = [
    { name: '图片分析', fn: testImageAnalysis, out: 'gemini-图片分析' },
    { name: '多图片比较', fn: testMultiImageComparison, out: 'gemini-多图片比较' },
    { name: '创意生成', fn: testImageCreativeGeneration, out: 'gemini-创意生成' },
    { name: '技术分析', fn: testImageTechnicalAnalysis, out: 'gemini-技术分析' },
  ];

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    logger.info(`--- 开始: ${s.name} ---`);
    const res = await withPerformanceMonitoring(s.fn, s.name)();
    // 统一保存（image-upload 内部已保存；此处确保命名与 responses 目录一致）
    if (res && (res.response || res.content)) {
      await saveResponse(s.out, res.response || res, { model, testType: s.name });
    }
    if (i < steps.length - 1) await delay(1500);
  }

  logger.info('=== 图片分析 合集示例完成 ===');
}

if (require.main === module) {
  main().catch(err => { logger.error('运行失败', err); process.exit(1); });
}

module.exports = { main };


