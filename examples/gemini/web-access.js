/**
 * Gemini 网页访问示例
 * 说明：示例直接抓取公开网页文本（example.com），再让模型总结要点。
 */

const { makeGeminiRequest, withPerformanceMonitoring, Logger, saveResponse, delay } = require('../utils');
const { config } = require('../config');

const logger = new Logger('gemini-web-access');

async function fetchPageText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'gemini-code-api-examples/1.0.0' } });
  const html = await res.text();
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                   .replace(/<style[\s\S]*?<\/style>/gi, '')
                   .replace(/<[^>]+>/g, ' ')
                   .replace(/\s+/g, ' ')
                   .trim();
  return text.slice(0, 8000); // 截断避免过长
}

async function testWebAccessSummary() {
  try {
    const url = 'https://www.baidu.com';
    logger.info(`抓取网页: ${url}`);
    const pageText = await fetchPageText(url);

    const contents = [{
      role: 'user',
      parts: [{ text: `以下是网页内容的纯文本，请用要点总结其核心信息，并给出3条可行动建议：\n\n${pageText}` }]
    }];

    const model = config.models.gemini.default;
    const resp = await makeGeminiRequest(model, contents, { maxOutputTokens: 800, temperature: 0.4 });

    await saveResponse('gemini-网页访问', { url, summary: resp.text }, {
      // 请求详情
    });
    return { success: true, length: resp.text?.length || 0 };
  } catch (error) {
    logger.error('网页访问示例失败:', error);
    return { success: false, error: error.message };
  }
}

async function main() {
  logger.info('=== Gemini 网页访问示例开始 ===');
  const result = await withPerformanceMonitoring(testWebAccessSummary, '网页访问与总结');
  await delay(200);
  return result;
}

if (require.main === module) {
  main().catch(err => { logger.error(err); process.exit(1); });
}

module.exports = { fetchPageText, testWebAccessSummary, main };
