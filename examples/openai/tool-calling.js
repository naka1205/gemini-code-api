/**
 * OpenAI 工具调用示例
 * 演示函数调用和工具使用功能
 */

const { makeOpenAIRequest, saveResponse, withPerformanceMonitoring, Logger } = require('../utils');
const { config } = require('../config');

const logger = new Logger('OpenAI-ToolCalling');

/**
 * 天气查询工具调用测试
 */
async function testWeatherToolCalling() {
  const model = config.models.openai.default;
  logger.info('开始天气查询工具调用测试', { model });

  const tools = [
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get the current weather in a given location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state, e.g. San Francisco, CA',
            },
            unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
          },
          required: ['location'],
        },
      },
    },
  ];

  const messages = [
    { role: 'user', content: "What's the weather like in Boston?" },
  ];

  const response = await makeOpenAIRequest(model, messages, {
    tools: tools,
    tool_choice: 'auto',
  });

  const message = response.choices[0].message;
  const hasToolCalls = !!message.tool_calls;

  logger.success('天气查询工具调用测试成功', {
    model,
    hasToolCalls,
    finishReason: response.choices[0].finish_reason,
  });

  console.log('\n🌤️ OpenAI 天气查询工具调用结果:');
  console.log('─'.repeat(50));
  console.log(`工具调用: ${hasToolCalls ? '是' : '否'}`);
  if (hasToolCalls) {
    console.log('工具调用详情:', JSON.stringify(message.tool_calls, null, 2));
  } else {
    console.log('模型回复:', message.content);
  }
  console.log('─'.repeat(50));

  await saveResponse('openai-天气查询', response, {
    model,
    testType: '天气查询',
    hasToolCalls,
  });

  return { success: true, response };
}

/**
 * 强制工具调用测试
 */
async function testForcedToolCalling() {
    const model = config.models.openai.default;
    logger.info('开始强制工具调用测试', { model });
  
    const tools = [
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get the current weather in a given location',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string', description: 'The city' },
            },
            required: ['location'],
          },
        },
      },
    ];
  
    const messages = [
      { role: 'user', content: "What is the weather in Paris?" },
    ];
  
    const response = await makeOpenAIRequest(model, messages, {
      tools: tools,
      tool_choice: { type: "function", function: { name: "get_weather" } },
    });
  
    const message = response.choices[0].message;
    const hasToolCalls = !!message.tool_calls;
    const finishReason = response.choices[0].finish_reason;
  
    logger.success('强制工具调用测试成功', {
      model,
      hasToolCalls,
      finishReason,
    });
  
    console.log('\n🔧 OpenAI 强制工具调用结果:');
    console.log('─'.repeat(50));
    console.log(`完成原因: ${finishReason}`);
    console.log(`工具调用: ${hasToolCalls ? '是' : '否'}`);
    if (hasToolCalls) {
      console.log('工具调用详情:', JSON.stringify(message.tool_calls, null, 2));
    }
    console.log('─'.repeat(50));
  
    await saveResponse('openai-强制工具调用', response, {
      model,
      testType: '强制工具调用',
      hasToolCalls,
    });
  
    return { success: true, response };
  }

/**
 * 主函数
 */
async function main() {
  logger.info('🚀 开始运行 OpenAI 工具调用示例');
  
  await withPerformanceMonitoring(testWeatherToolCalling, '天气查询')();
  await new Promise(resolve => setTimeout(resolve, 1000)); // 间隔
  await withPerformanceMonitoring(testForcedToolCalling, '强制工具调用')();

  logger.success('所有 OpenAI 工具调用测试完成');
}

if (require.main === module) {
  main().catch(error => {
    logger.error('示例运行失败:', error);
    process.exit(1);
  });
}

module.exports = {
  main,
  testWeatherToolCalling,
  testForcedToolCalling,
};
