/**
 * Gemini 工具调用示例
 * 演示函数调用和工具使用功能
 * 根据 Google Gemini API 官方文档实现
 * 参考: https://ai.google.dev/api/generate-content
 * 
 * @author Gemini Code Team
 * @date 2024-12-19
 */

const { config, validateConfig, getModelConfig } = require('../config');
const { 
  makeGeminiRequest, 
  saveResponse, 
  validateResponse, 
  withPerformanceMonitoring,
  Logger 
} = require('../utils');

const logger = new Logger('Gemini-ToolCalling');

/**
 * 天气查询工具调用测试
 */
async function testWeatherToolCalling() {
  const model = getModelConfig('gemini', 'default');
  
  logger.info('开始天气查询工具调用测试', { model });
  
  // 根据官方文档定义工具
  const tools = [
    {
      functionDeclarations: [
        {
          name: 'get_weather',
          description: 'Get the current weather in a given location',
          parameters: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'The city and state, e.g. San Francisco, CA'
              },
              unit: {
                type: 'string',
                enum: ['celsius', 'fahrenheit'],
                description: 'The unit of temperature, either "celsius" or "fahrenheit"'
              }
            },
            required: ['location']
          }
        }
      ]
    }
  ];
  
  const contents = [
    {
      role: 'user',
      parts: [{ text: 'What is the weather like in San Francisco?' }]
    }
  ];
  
  const generationConfig = {
    temperature: 0.3,
    maxOutputTokens: 1024,
  };
  
  const response = await makeGeminiRequest(model, contents, {
    generationConfig,
    tools,
  });
  
  validateResponse(response, ['candidates']);
  
  const candidate = response.candidates[0];
  
  // 检查是否有函数调用
  const functionCall = candidate.content.parts.find(part => part.functionCall);
  const hasFunctionCall = !!functionCall;
  
  // 提取文本内容
  const textPart = candidate.content.parts.find(part => part.text);
  const content = textPart ? textPart.text : '';
  
  logger.success('天气查询工具调用测试成功', {
    model,
    hasFunctionCall,
    responseLength: content.length,
    tokenUsage: response.usageMetadata,
  });
  
  console.log('\n🌤️  Gemini 天气查询工具调用结果:');
  console.log('─'.repeat(50));
  
  if (functionCall) {
    console.log('🔧 函数调用:');
    console.log(`  函数名: ${functionCall.functionCall.name}`);
    console.log(`  参数: ${JSON.stringify(functionCall.functionCall.args, null, 2)}`);
  }
  
  if (content) {
    console.log('\n📝 模型回复:');
    console.log(content);
  }
  
  console.log('─'.repeat(50));
  
  return { response, content, functionCall };
}

/**
 * 计算器工具调用测试
 */
async function testCalculatorToolCalling() {
  const model = getModelConfig('gemini', 'default');
  
  logger.info('开始计算器工具调用测试', { model });
  
  const tools = [
    {
      functionDeclarations: [
        {
          name: 'calculate',
          description: 'Perform mathematical calculations',
          parameters: {
            type: 'object',
            properties: {
              expression: {
                type: 'string',
                description: 'The mathematical expression to evaluate'
              }
            },
            required: ['expression']
          }
        }
      ]
    }
  ];
  
  const contents = [
    {
      role: 'user',
      parts: [{ text: 'Calculate 15 * 23 + 7' }]
    }
  ];
  
  const generationConfig = {
    temperature: 0.1,
    maxOutputTokens: 512,
  };
  
  const response = await makeGeminiRequest(model, contents, {
    generationConfig,
    tools,
  });
  
  validateResponse(response, ['candidates']);
  
  const candidate = response.candidates[0];
  const functionCall = candidate.content.parts.find(part => part.functionCall);
  const textPart = candidate.content.parts.find(part => part.text);
  const content = textPart ? textPart.text : '';
  
  logger.success('计算器工具调用测试成功', {
    model,
    hasFunctionCall: !!functionCall,
    responseLength: content.length,
    tokenUsage: response.usageMetadata,
  });
  
  console.log('\n🧮 Gemini 计算器工具调用结果:');
  console.log('─'.repeat(50));
  
  if (functionCall) {
    console.log('🔧 函数调用:');
    console.log(`  函数名: ${functionCall.functionCall.name}`);
    console.log(`  参数: ${JSON.stringify(functionCall.functionCall.args, null, 2)}`);
  }
  
  if (content) {
    console.log('\n📝 模型回复:');
    console.log(content);
  }
  
  console.log('─'.repeat(50));
  
  return { response, content, functionCall };
}

/**
 * 多工具调用测试
 */
async function testMultiToolCalling() {
  const model = getModelConfig('gemini', 'default');
  
  logger.info('开始多工具调用测试', { model });
  
  const tools = [
    {
      functionDeclarations: [
        {
          name: 'get_weather',
          description: 'Get the current weather in a given location',
          parameters: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'The city and state'
              }
            },
            required: ['location']
          }
        },
        {
          name: 'search_restaurants',
          description: 'Search for restaurants in a given location',
          parameters: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'The city and state'
              },
              cuisine: {
                type: 'string',
                description: 'Type of cuisine (optional)'
              }
            },
            required: ['location']
          }
        }
      ]
    }
  ];
  
  const contents = [
    {
      role: 'user',
      parts: [{ text: "I'm planning a trip to New York. Can you tell me the weather and recommend some Italian restaurants?" }]
    }
  ];
  
  const generationConfig = {
    temperature: 0.3,
    maxOutputTokens: 1024,
  };
  
  const response = await makeGeminiRequest(model, contents, {
    generationConfig,
    tools,
  });
  
  validateResponse(response, ['candidates']);
  
  const candidate = response.candidates[0];
  const functionCalls = candidate.content.parts.filter(part => part.functionCall);
  const textPart = candidate.content.parts.find(part => part.text);
  const content = textPart ? textPart.text : '';
  
  logger.success('多工具调用测试成功', {
    model,
    functionCallCount: functionCalls.length,
    responseLength: content.length,
    tokenUsage: response.usageMetadata,
  });
  
  console.log('\n🔧 Gemini 多工具调用结果:');
  console.log('─'.repeat(50));
  console.log(`函数调用数量: ${functionCalls.length}`);
  
  functionCalls.forEach((call, index) => {
    console.log(`\n工具 ${index + 1}:`);
    console.log(`  函数名: ${call.functionCall.name}`);
    console.log(`  参数: ${JSON.stringify(call.functionCall.args, null, 2)}`);
  });
  
  if (content) {
    console.log('\n📝 模型回复:');
    console.log(content);
  }
  
  console.log('─'.repeat(50));
  
  return { response, content, functionCalls };
}

/**
 * 强制工具使用测试
 */
async function testForcedToolCalling() {
  const model = getModelConfig('gemini', 'default');
  
  logger.info('开始强制工具使用测试', { model });
  
  const tools = [
    {
      functionDeclarations: [
        {
          name: 'record_summary',
          description: 'Record summary using well-structured JSON',
          parameters: {
            type: 'object',
            properties: {
              description: {
                type: 'string',
                description: 'Summary description'
              },
              key_points: {
                type: 'array',
                items: { type: 'string' },
                description: 'Key points from the summary'
              }
            },
            required: ['description']
          }
        }
      ]
    }
  ];
  
  const contents = [
    {
      role: 'user',
      parts: [{ text: 'Summarize the benefits of artificial intelligence in healthcare.' }]
    }
  ];
  
  const generationConfig = {
    temperature: 0.3,
    maxOutputTokens: 1024,
  };
  
  // 注意：Gemini API 使用 toolConfig 来强制工具使用
  const response = await makeGeminiRequest(model, contents, {
    generationConfig,
    tools,
    toolConfig: {
      functionCallingConfig: {
        mode: 'ANY' // 或 'AUTO', 'NONE'
      }
    }
  });
  
  validateResponse(response, ['candidates']);
  
  const candidate = response.candidates[0];
  const functionCall = candidate.content.parts.find(part => part.functionCall);
  const textPart = candidate.content.parts.find(part => part.text);
  const content = textPart ? textPart.text : '';
  
  const forcedToolUsed = !!functionCall;
  
  logger.success('强制工具使用测试成功', {
    model,
    forcedToolUsed,
    responseLength: content.length,
    tokenUsage: response.usageMetadata,
  });
  
  console.log('\n🔧 Gemini 强制工具使用结果:');
  console.log('─'.repeat(50));
  console.log('强制工具使用:', forcedToolUsed ? '成功' : '失败');
  
  if (functionCall) {
    console.log('🔧 函数调用:');
    console.log(`  函数名: ${functionCall.functionCall.name}`);
    console.log(`  参数: ${JSON.stringify(functionCall.functionCall.args, null, 2)}`);
  }
  
  if (content) {
    console.log('\n📝 模型回复:');
    console.log(content);
  }
  
  console.log('─'.repeat(50));
  
  return { response, content, functionCall };
}

/**
 * 主函数
 */
async function main() {
  try {
    logger.info('🚀 开始运行 Gemini 工具调用示例');
    
    // 验证配置
    validateConfig();
    
    // 运行各种测试
    const tests = [
      { name: '天气查询', fn: testWeatherToolCalling },
      { name: '计算器', fn: testCalculatorToolCalling },
      { name: '多工具调用', fn: testMultiToolCalling },
      { name: '强制工具使用', fn: testForcedToolCalling },
    ];
    
    const results = {};
    
    for (const test of tests) {
      logger.info(`开始测试: ${test.name}`);
      
      try {
        const result = await withPerformanceMonitoring(test.fn, test.name)();
        results[test.name] = result;
        
        // 保存响应（如果启用）
        await saveResponse(`gemini-${test.name.toLowerCase().replace(/\s+/g, '-')}`, result.response, {
          model: getModelConfig('gemini', 'default'),
          testType: test.name,
          hasFunctionCalls: !!(result.functionCall || result.functionCalls?.length),
        });
        
        // 测试间隔
        if (test !== tests[tests.length - 1]) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        logger.error(`${test.name} 测试失败`, error);
        results[test.name] = { error: error.message };
      }
    }
    
    // 输出总结
    console.log('\n📊 测试总结:');
    console.log('─'.repeat(50));
    
    for (const [testName, result] of Object.entries(results)) {
      if (result.error) {
        console.log(`❌ ${testName}: 失败 - ${result.error}`);
      } else {
        const tokenCount = result.response?.usageMetadata?.totalTokenCount || 0;
        const functionCallCount = result.functionCall ? 1 : (result.functionCalls?.length || 0);
        console.log(`✅ ${testName}: 成功 - ${tokenCount} tokens, ${functionCallCount} 个函数调用`);
      }
    }
    
    logger.success('所有测试完成');
    
  } catch (error) {
    logger.error('示例运行失败', error);
    process.exit(1);
  }
}

// 如果直接运行此文件，则执行主函数
if (require.main === module) {
  main();
}

module.exports = {
  main,
  testWeatherToolCalling,
  testCalculatorToolCalling,
  testMultiToolCalling,
  testForcedToolCalling,
};
