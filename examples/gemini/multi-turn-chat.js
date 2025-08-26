/**
 * Gemini 多轮对话示例（非流式）
 */
const { makeGeminiRequest, withPerformanceMonitoring, Logger, saveResponse, delay } = require('../utils');
const { config } = require('../config');
const logger = new Logger('gemini-multi-turn');

async function testMultiTurn() {
  try {
    const model = config.models.gemini.default;
    const history = [
      { role: 'user', parts: [{ text: '我们来规划一次3天的东京旅行，先给出一个高层行程框架。' }] },
    ];
    
    logger.info('📤 发送第一轮对话请求...');
    const r1 = await makeGeminiRequest(model, history, { temperature: 0.6, maxOutputTokens: 600 });
    
    // 修复：正确处理 Gemini API 响应格式
    let turn1Text = '';
    if (r1.candidates && r1.candidates[0] && r1.candidates[0].content) {
      const parts = r1.candidates[0].content.parts || [];
      turn1Text = parts.map(part => part.text).join('');
    }
    
    logger.info('📥 第一轮响应:', { textLength: turn1Text.length, text: turn1Text.substring(0, 100) + '...' });
    
    // 添加第一轮回复到对话历史
    history.push({ role: 'model', parts: [{ text: turn1Text }] });
    history.push({ role: 'user', parts: [{ text: '在第2天加入美食体验，并给出3家店的排队建议。' }] });
    
    // 优化：添加延迟，避免过快请求
    logger.info('⏳ 等待 3 秒后发送第二轮请求...');
    await delay(3000);
    
    logger.info('📤 发送第二轮对话请求...');
    const r2 = await makeGeminiRequest(model, history, { temperature: 0.6, maxOutputTokens: 700 });
    
    // 修复：正确处理第二轮响应
    let turn2Text = '';
    if (r2.candidates && r2.candidates[0] && r2.candidates[0].content) {
      const parts = r2.candidates[0].content.parts || [];
      turn2Text = parts.map(part => part.text).join('');
    }
    
    logger.info('📥 第二轮响应:', { textLength: turn2Text.length, text: turn2Text.substring(0, 100) + '...' });

    await saveResponse('gemini-multi-turn', { 
      turn1: turn1Text, 
      turn2: turn2Text,
      fullHistory: history,
      model: model
    }, {
      // 请求详情
    });
    
    return { 
      success: true, 
      turns: 2, 
      turn1Length: turn1Text.length,
      turn2Length: turn2Text.length
    };
  } catch (e) {
    logger.error('多轮对话失败:', e);
    return { success: false, error: e.message };
  }
}

async function main() {
  logger.info('=== Gemini 多轮对话示例开始 ===');
  
  // 添加延迟，确保不会立即开始测试
  logger.info('⏳ 等待 2 秒后开始测试...');
  await delay(2000);
  
  const result = await withPerformanceMonitoring(testMultiTurn, '多轮对话');
  
  // 测试完成后添加延迟
  logger.info('⏳ 测试完成，等待 1 秒后退出...');
  await delay(1000);
  
  return result;
}

if (require.main === module) {
  main().catch(err => { 
    logger.error('示例运行失败:', err); 
    process.exit(1); 
  });
}

module.exports = { testMultiTurn, main };
