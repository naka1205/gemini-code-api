const { makeRequest, saveResponse, withPerformanceMonitoring, Logger } = require('../utils');
const { config } = require('../config');

const logger = new Logger('Gemini-Embeddings');

async function main() {
  logger.info('开始 Gemini 嵌入向量示例');
  const model = 'text-embedding-004';
  const text = 'The quick brown fox jumps over the lazy dog.';

  const run = async () => {
    const body = {
      content: { parts: [{ text }] }
    };
    const endpoint = `v1beta/models/${model}:embedContent`;
    const res = await makeRequest(endpoint, { method: 'POST', body });

    await saveResponse('gemini-embeddings', res, { model, text });
    logger.success('嵌入向量生成成功', { dimensions: res?.embedding?.values?.length || 0 });
    return { success: true, dimensions: res?.embedding?.values?.length || 0 };
  };

  return withPerformanceMonitoring(run, 'embeddings')();
}

if (require.main === module) {
  main().catch((e) => {
    console.error('embeddings 示例失败:', e?.message || e);
    process.exit(1);
  });
}

module.exports = { main };


