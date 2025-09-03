/**
 * OpenAI 流式输出示例
 */

const { makeOpenAIRequest, Logger } = require('../utils');
const { config, getModelConfig } = require('../config');

const logger = new Logger('OpenAI-Streaming');

async function testStreamingChat() {
  const model = getModelConfig('openai', 'default');
  const messages = [
    {
      role: 'user',
      content: '请详细介绍一下人工智能的发展历程，包括重要的里程碑事件。'
    }
  ];

  logger.info('开始流式对话测试', { model, prompt: messages[0].content });

  try {
    const response = await makeOpenAIRequest(model, messages, {
      stream: true,
      max_tokens: 500,
      temperature: 0.7,
    });

    if (!response.body) {
      throw new Error('No response body for streaming');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let streamContent = '';

    console.log('\n🔄 流式响应内容:');
    console.log('──────────────────────────────────────────────────');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6);
          if (data === '[DONE]') {
            console.log('\n──────────────────────────────────────────────────');
            logger.success('流式响应完成');
            break;
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed.choices?.[0]?.delta?.content) {
              const content = parsed.choices[0].delta.content;
              process.stdout.write(content);
              streamContent += content;
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }

    logger.success('流式对话测试成功', {
      model,
      responseLength: streamContent.length,
    });

    return { content: streamContent };

  } catch (error) {
    logger.error('流式对话测试失败', error);
    throw error;
  }
}

async function main() {
  logger.info('🚀 开始运行 OpenAI 流式输出示例');

  try {
    const result = await testStreamingChat();
    
    console.log('\n\n📊 测试结果:');
    console.log('──────────────────────────────────────────────────');
    console.log(`✅ 流式对话: 成功 - 长度: ${result.content.length}`);

  } catch (error) {
    logger.error('示例运行失败', error);
    console.log('\n📊 测试结果:');
    console.log('──────────────────────────────────────────────────');
    console.log(`❌ 流式对话: 失败 - ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testStreamingChat };