/**
 * Gemini 结构化输出（仅 JSON）包装器
 * 仅生成 gemini-structured-json.json
 */

const { testJsonOutput } = require('./structured-output');
const { withPerformanceMonitoring, Logger } = require('../utils');

const logger = new Logger('gemini-structured-json-only');

async function main() {
  logger.info('=== 仅运行 JSON 结构化输出示例 ===');
  const result = await withPerformanceMonitoring(testJsonOutput, 'JSON 格式输出')();
  return result;
}

if (require.main === module) {
  main().catch(err => { logger.error('运行失败', err); process.exit(1); });
}

module.exports = { main };


