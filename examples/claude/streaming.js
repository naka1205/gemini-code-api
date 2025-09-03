/**
 * Claude 流式响应示例
 * 演示如何处理流式响应事件 (带详细日志)
 */

const { makeClaudeRequest, withPerformanceMonitoring, Logger } = require('../utils');
const { config } = require('../config');

const logger = new Logger('Claude-Streaming-Debug');

/**
 * 流式响应测试 (带详细日志)
 */
async function testStreamingDebug() {
  logger.info('开始流式响应测试 (Debug Mode)', { model: config.models.claude.default });

  try {
    const messages = [{ 
      role: 'user',
      content: '请写一首关于星空的短诗。'
    }];

    const response = await makeClaudeRequest(config.models.claude.default, messages, {
      max_tokens: 1024,
      temperature: 0.7,
      stream: true,
    });

    if (!response.body) {
      throw new Error('响应中没有 body');
    }

    let fullText = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    console.log('\n🌌 流式响应原始事件:');
    console.log('─'.repeat(50));

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        logger.info('读取流结束');
        break;
      }
      const chunk = decoder.decode(value);
      
      // 打印原始数据块
      logger.debug('接收到原始数据块:', chunk);

      const lines = chunk.split('\n\n');

      for (const line of lines) {
        if (line.trim() === '') continue;
        
        console.log(`[RAW EVENT]: ${line}\n`); // 打印每个原始事件

        if (line.startsWith('data: ')) {
          const data = line.substring(6);
          try {
            const parsed = JSON.parse(data);
            
            // 打印解析后的JSON对象
            logger.info('解析事件成功:', parsed);

            if (parsed.type === 'content_block_delta' && parsed.delta.type === 'text_delta') {
              const text = parsed.delta.text;
              process.stdout.write(text);
              fullText += text;
            } else if (parsed.type === 'message_stop') {
              logger.info('接收到 message_stop 事件');
            }
          } catch (e) {
            logger.error('JSON 解析失败:', { data, error: e.message });
          }
        }
      }
    }
    
    console.log('\n' + '─'.repeat(50));
    logger.success('流式响应测试完成', { responseLength: fullText.length });
    return { success: true, responseLength: fullText.length };

  } catch (error) {
    logger.error('流式响应测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 主函数
 */
async function main() {
  logger.info('🚀 开始运行 Claude 流式响应 (Debug) 示例');
  await withPerformanceMonitoring(testStreamingDebug, '流式响应 (Debug)')();
}

if (require.main === module) {
  main().catch(error => {
    logger.error('示例运行失败:', error);
    process.exit(1);
  });
}

module.exports = {
  testStreamingDebug,
  main
};