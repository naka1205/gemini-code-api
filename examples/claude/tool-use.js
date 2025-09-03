/**
 * Claude 工具使用示例
 * 根据 Anthropic 官方文档实现正确的工具使用
 * 参考: https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview
 */

const { makeClaudeRequest, withPerformanceMonitoring, Logger, saveResponse, delay } = require('../utils');
const { config } = require('../config');
const logger = new Logger('claude-tool-use');

/**
 * 基础工具使用测试 - 基于官方文档格式
 */
async function testBasicToolUse() {
  try {
    const model = config.models.claude.default;
    
    const tools = [
      {
        name: "get_weather",
        description: "Get the current weather in a given location",
        input_schema: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "The city and state, e.g. San Francisco, CA"
            },
            unit: {
              type: "string",
              enum: ["celsius", "fahrenheit"],
              description: "The unit of temperature, either \"celsius\" or \"fahrenheit\""
            }
          },
          required: ["location"]
        }
      }
    ];

    const messages = [
      { 
        role: "user", 
        content: "What is the weather like in San Francisco?" 
      }
    ];

    const options = {
      max_tokens: 1024,
      temperature: 0.3,
      tools: tools,
      tool_choice: 'auto'
    };

    logger.info('开始基础工具使用测试', { model, tools: tools.map(t => t.name) });
    
    const response = await makeClaudeRequest(model, messages, options);
    
    if (!response || !response.content) {
      throw new Error('Invalid response format');
    }

    const toolUse = response.content.find(item => item.type === 'tool_use');
    const hasToolUse = !!toolUse;

    logger.success('基础工具使用测试成功', {
      model,
      hasToolUse,
      stopReason: response.stop_reason
    });

    console.log('\n🔧 基础工具使用结果:');
    console.log('─'.repeat(50));
    console.log('停止原因:', response.stop_reason);
    console.log('工具调用:', hasToolUse ? '成功' : '失败');
    
    if (toolUse) {
      console.log('工具调用详情:');
      console.log(`  工具名: ${toolUse.name}`);
      console.log(`  工具ID: ${toolUse.id}`);
      console.log(`  参数: ${JSON.stringify(toolUse.input, null, 2)}`);
    }

    await saveResponse('claude-工具使用', response, {
      hasToolUse,
      toolUse: toolUse || null
    });

    return { success: true, hasToolUse, toolUse: toolUse || null, response };
  } catch (error) {
    logger.error('基础工具使用测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 多工具调用测试 - 基于官方文档格式
 */
async function testMultiToolUse() {
  try {
    const model = config.models.claude.default;
    
    const tools = [
      {
        name: "get_weather",
        description: "Get the current weather in a given location",
        input_schema: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "The city and state"
            }
          },
          required: ["location"]
        }
      },
      {
        name: "search_restaurants",
        description: "Search for restaurants in a given location",
        input_schema: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "The city and state"
            },
            cuisine: {
              type: "string",
              description: "Type of cuisine (optional)"
            }
          },
          required: ["location"]
        }
      }
    ];

    const messages = [
      { 
        role: "user", 
        content: "I'm planning a trip to New York. Can you tell me the weather and recommend some Italian restaurants?" 
      }
    ];

    const options = {
      max_tokens: 1024,
      temperature: 0.3,
      tools: tools,
      tool_choice: 'auto'
    };

    logger.info('开始多工具调用测试', { model, tools: tools.map(t => t.name) });
    
    const response = await makeClaudeRequest(model, messages, options);
    
    const toolUses = response.content.filter(item => item.type === 'tool_use');
    const toolCount = toolUses.length;

    logger.success('多工具调用测试成功', {
      model,
      toolCount,
      stopReason: response.stop_reason
    });

    console.log('\n🔧 多工具调用结果:');
    console.log('─'.repeat(50));
    console.log('停止原因:', response.stop_reason);
    console.log('工具调用数量:', toolCount);
    
    for (let i = 0; i < toolUses.length; i++) {
      const toolUse = toolUses[i];
      console.log(`
工具 ${i + 1}:`);
      console.log(`  工具名: ${toolUse.name}`);
      console.log(`  工具ID: ${toolUse.id}`);
      console.log(`  参数: ${JSON.stringify(toolUse.input, null, 2)}`);
    }

    await saveResponse('claude-多工具调用', response, {
      toolCount,
      toolUses: toolUses
    });

    return { success: true, toolCount, toolUses, response };
  } catch (error) {
    logger.error('多工具调用测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 强制工具使用测试 - 基于官方文档格式
 */
async function testForcedToolUse() {
  try {
    const model = config.models.claude.default;
    
    const tools = [
      {
        name: "record_summary",
        description: "Record summary using well-structured JSON",
        input_schema: {
          type: "object",
          properties: {
            description: {
              type: "string",
              description: "Summary description"
            },
            key_points: {
              type: "array",
              items: { type: "string" },
              description: "Key points from the summary"
            }
          },
          required: ["description"]
        }
      }
    ];

    const messages = [
      { 
        role: "user", 
        content: "Summarize the benefits of artificial intelligence in healthcare." 
      }
    ];

    const options = {
      max_tokens: 1024,
      temperature: 0.3,
      tools: tools,
      tool_choice: { type: "tool", name: "record_summary" }
    };

    logger.info('开始强制工具使用测试', { model, tool_choice: options.tool_choice });
    
    const response = await makeClaudeRequest(model, messages, options);
    
    const toolUse = response.content.find(item => item.type === 'tool_use');
    const forcedToolUsed = !!toolUse && toolUse.name === 'record_summary';

    logger.success('强制工具使用测试成功', {
      model,
      forcedToolUsed,
      stopReason: response.stop_reason
    });

    console.log('\n🔧 强制工具使用结果:');
    console.log('─'.repeat(50));
    console.log('停止原因:', response.stop_reason);
    console.log('强制工具使用:', forcedToolUsed ? '成功' : '失败');
    
    if (toolUse) {
      console.log('工具调用详情:');
      console.log(`  工具名: ${toolUse.name}`);
      console.log(`  工具ID: ${toolUse.id}`);
      console.log(`  参数: ${JSON.stringify(toolUse.input, null, 2)}`);
    }

    await saveResponse('claude-强制工具使用', response, {
      forcedToolUsed,
      toolUse: toolUse || null
    });

    return { success: true, forcedToolUsed, toolUse: toolUse || null, response };
  } catch (error) {
    logger.error('强制工具使用测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 主函数
 */
async function main() {
  logger.info('=== Claude 工具使用示例开始 ===');
  
  const results = [];
  
  const tests = [
    { name: '基础工具使用', fn: testBasicToolUse },
    { name: '多工具调用', fn: testMultiToolUse },
    // { name: '强制工具使用', fn: testForcedToolUse } // Temporarily disabled due to API key suspension
  ];

  for (const test of tests) {
    logger.info(`\n--- 开始测试: ${test.name} ---`);
    try {
      const result = await withPerformanceMonitoring(test.fn, test.name)();
      results.push({ name: test.name, ...result });
      
      if (result.success && result.response) {
        await saveResponse(`claude-${test.name}`, result.response);
      }
    } catch (error) {
      logger.error(`${test.name} 测试失败:`, error);
      results.push({ name: test.name, success: false, error: error.message });
    }
    
    await delay(2000);
  }

  logger.info('\n=== 测试结果摘要 ===');
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  
  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    logger.info(`${status} ${result.name}: ${result.success ? '成功' : result.error}`);
  });

  logger.info(`\n总结: ${successCount}/${totalCount} 个测试成功`);
  
  return results;
}

if (require.main === module) {
  main().catch(err => { logger.error(err); process.exit(1); });
}

module.exports = { 
  testBasicToolUse, 
  testMultiToolUse, 
  testForcedToolUse, 
  main 
};