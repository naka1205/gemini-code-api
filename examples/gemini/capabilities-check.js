/**
 * Gemini 能力自测脚本（独立运行）
 * 覆盖文档中的关键能力最小化用例：
 * - Text generation
 * - Vision (单图理解)
 * - JSON Mode（结构化输出）
 * - Function calling（工具调用）
 * - Long context（小型长上下文验证）
 *
 * 参考官方文档: https://ai.google.dev/api/generate-content
 */

const { config, getModelConfig } = require('../config');
const {
  makeGeminiRequest,
  saveResponse,
  withPerformanceMonitoring,
  Logger,
  readTestImage,
  delay,
} = require('../utils');

const logger = new Logger('gemini-capabilities-check');

async function testText() {
  const model = getModelConfig('gemini', 'default');
  const contents = [{ role: 'user', parts: [{ text: '用两句话概述你能做什么。' }] }];
  const resp = await makeGeminiRequest(model, contents, { maxOutputTokens: 200, temperature: 0.3 });
  return { ok: !!resp, model, sample: resp?.text || '' };
}

async function testVision() {
  const model = getModelConfig('gemini', 'vision');
  const img = await readTestImage('sample-image.png');
  const contents = [{
    role: 'user',
    parts: [
      { text: '用一句话描述图片。' },
      { inlineData: { mimeType: img.mimeType, data: img.data } },
    ],
  }];
  const resp = await makeGeminiRequest(model, contents, { maxOutputTokens: 120, temperature: 0.2 });
  return { ok: !!resp, model, sample: resp?.candidates?.[0]?.content?.parts?.[0]?.text || resp?.text || '' };
}

async function testJsonMode() {
  const model = getModelConfig('gemini', 'default');
  const contents = [{
    role: 'user',
    parts: [{ text: '请以严格 JSON 输出：{"task":"sum","a":3,"b":5,"result":8}，仅输出 JSON。' }],
  }];
  const resp = await makeGeminiRequest(model, contents, { maxOutputTokens: 120, temperature: 0 });
  let isJson = false;
  try { JSON.parse(resp?.text || '{}'); isJson = true; } catch {}
  return { ok: !!resp && isJson, model, sample: resp?.text || '' };
}

async function testFunctionCalling() {
  const model = getModelConfig('gemini', 'default');
  const tools = [{
    functionDeclarations: [{
      name: 'get_weather',
      description: 'Get the current weather',
      parameters: {
        type: 'object', properties: { location: { type: 'string' }, unit: { type: 'string', enum: ['celsius','fahrenheit'] } }, required: ['location']
      },
    }],
  }];
  const contents = [{ role: 'user', parts: [{ text: 'What is the weather in Tokyo?' }] }];
  const resp = await makeGeminiRequest(model, contents, { tools, maxOutputTokens: 100, temperature: 0.2 });
  const part = resp?.candidates?.[0]?.content?.parts?.find(p => p.functionCall);
  return { ok: !!part, model, functionName: part?.functionCall?.name || null, args: part?.functionCall?.args || null };
}

async function testLongContext() {
  const model = getModelConfig('gemini', 'pro');
  const para = '人工智能正在改变世界。';
  const longText = new Array(200).fill(para).join(''); // 轻量长上下文
  const contents = [{ role: 'user', parts: [{ text: `请在50字内概述以下文本的主题：\n${longText}` }] }];
  const resp = await makeGeminiRequest(model, contents, { maxOutputTokens: 120, temperature: 0.3 });
  return { ok: !!resp, model, sample: resp?.text || '' };
}

async function main() {
  logger.info('=== Gemini 能力自测开始 ===');
  const plan = [
    { key: 'text', fn: testText },
    { key: 'vision', fn: testVision },
    { key: 'json', fn: testJsonMode },
    { key: 'function_calling', fn: testFunctionCalling },
    { key: 'long_context', fn: testLongContext },
  ];

  const report = { timestamp: new Date().toISOString(), apiBase: config.api.baseUrl, results: {} };

  for (let i = 0; i < plan.length; i++) {
    const { key, fn } = plan[i];
    try {
      const res = await withPerformanceMonitoring(fn, `cap_${key}`)();
      report.results[key] = { ok: !!res?.ok, details: res };
    } catch (e) {
      report.results[key] = { ok: false, error: e?.message || String(e) };
    }
    if (i < plan.length - 1) await delay(500);
  }

  await saveResponse('gemini-capabilities', report, { kind: 'capabilities-check' });
  logger.info('=== 能力自测完成 ===');
}

if (require.main === module) {
  main().catch(err => { logger.error('运行失败', err); process.exit(1); });
}

module.exports = { main };


