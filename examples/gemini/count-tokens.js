const { makeRequest, saveResponse, withPerformanceMonitoring, Logger } = require('../utils');
const { config } = require('../config');

const logger = new Logger('Gemini-CountTokens');

async function main() {
  logger.info('开始 Gemini token 计数示例');
  const model = config.models.gemini.default;
  const prompt = '请用不超过100字概述机器学习的核心思想。';

  const run = async () => {
    const body = { model, prompt };
    const res = await makeRequest('v1/count-tokens', { method: 'POST', body });
    await saveResponse('gemini-count-tokens', res, { model, prompt });
    logger.success('token 计数成功', res);
    return { success: true, totalTokens: res?.total_tokens || 0 };
  };

  return withPerformanceMonitoring(run, 'countTokens')();
}

if (require.main === module) {
  main().catch((e) => {
    console.error('count-tokens 示例失败:', e?.message || e);
    process.exit(1);
  });
}

module.exports = { main };


