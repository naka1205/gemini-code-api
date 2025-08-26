/**
 * Claude Extended Thinking 示例
 * 测试 Claude 官方 Extended Thinking 参数
 */

const { makeClaudeRequest, saveResponse, withPerformanceMonitoring, delay, Logger } = require('../utils');
const { config } = require('../config');

const logger = new Logger('claude-extended-thinking');

/**
 * 测试基础 Extended Thinking
 */
async function testBasicExtendedThinking() {
  logger.info('开始测试基础 Extended Thinking');
  
  try {
    const model = config.models.claude.sonnet4;
    const messages = [{
      role: 'user',
      content: '请分析一下量子计算的基本原理，并思考它与传统计算的区别。'
    }];

    const response = await makeClaudeRequest(model, messages, {
      thinking: {
        type: 'enabled',
        budget_tokens: 5000
      },
      max_tokens: 2000,
      temperature: 0.7
    });

    logger.info('Extended Thinking 响应完成');
    
    // 检查响应中是否包含思考内容
    const hasThinking = response.content && response.content.some(item => item.type === 'thinking');
    const thinkingContent = response.content?.find(item => item.type === 'thinking')?.thinking || '';
    
    logger.info(`思考内容检查: ${hasThinking ? '✅ 包含' : '❌ 不包含'}`);
    if (hasThinking) {
      logger.info(`思考内容长度: ${thinkingContent.length} 字符`);
    }
    
    await saveResponse('claude-extended-thinking-basic', { 
      response, 
      hasThinking, 
      thinkingLength: thinkingContent.length 
    }, {
      // 请求详情
    });
    
    return { 
      success: true, 
      hasThinking, 
      thinkingLength: thinkingContent.length,
      responseLength: response.content?.length || 0
    };
  } catch (error) {
    logger.error('基础 Extended Thinking 测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 测试流式 Extended Thinking
 */
async function testStreamingExtendedThinking() {
  logger.info('开始测试流式 Extended Thinking');
  
  try {
    const model = config.models.claude.sonnet4;
    const messages = [{
      role: 'user',
      content: '请用流式方式分析人工智能的发展趋势，并详细思考各个方面。'
    }];

    const response = await makeClaudeRequest(model, messages, {
      thinking: {
        type: 'enabled',
        budget_tokens: 8000
      },
      stream: true,
      max_tokens: 3000,
      temperature: 0.6
    });

    logger.info('流式 Extended Thinking 响应开始');
    let fullResponse = '';
    let thinkingContent = '';
    let chunkCount = 0;
    let hasThinking = false;

    // 检查响应是否为流式响应
    if (response && response.body && typeof response.body[Symbol.asyncIterator] === 'function') {
      for await (const chunk of response.body) {
        chunkCount++;
        const text = new TextDecoder().decode(chunk);
        
        // 检查是否包含思考内容
        if (text.includes('"type":"thinking"') || text.includes('thinking_delta')) {
          hasThinking = true;
        }
        
        process.stdout.write(text);
        fullResponse += text;
        
        // 模拟实时效果
        await delay(30);
      }
    } else {
      // 如果不是流式响应，直接处理
      logger.info('收到非流式响应，直接处理');
      fullResponse = JSON.stringify(response);
      hasThinking = response.content && response.content.some(item => item.type === 'thinking');
    }

    logger.info(`流式 Extended Thinking 完成，共接收 ${chunkCount} 个数据块`);
    logger.info(`思考内容检查: ${hasThinking ? '✅ 包含' : '❌ 不包含'}`);
    
    await saveResponse('claude-extended-thinking-streaming', { 
      response: fullResponse, 
      chunkCount, 
      hasThinking 
    }, {
      // 请求详情
    });
    
    return { 
      success: true, 
      chunkCount, 
      hasThinking, 
      responseLength: fullResponse.length 
    };
  } catch (error) {
    logger.error('流式 Extended Thinking 测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 测试自定义思考预算
 */
async function testCustomThinkingBudget() {
  logger.info('开始测试自定义思考预算');
  
  try {
    const model = config.models.claude.sonnet4;
    const messages = [{
      role: 'user',
      content: '请深入思考并解释机器学习中的过拟合问题及其解决方案。'
    }];

    const response = await makeClaudeRequest(model, messages, {
      thinking: {
        type: 'enabled',
        budget_tokens: 3000  // 较小的思考预算
      },
      max_tokens: 1500,
      temperature: 0.3
    });

    logger.info('自定义思考预算测试完成');
    
    const hasThinking = response.content && response.content.some(item => item.type === 'thinking');
    const thinkingContent = response.content?.find(item => item.type === 'thinking')?.thinking || '';
    
    logger.info(`思考内容检查: ${hasThinking ? '✅ 包含' : '❌ 不包含'}`);
    if (hasThinking) {
      logger.info(`思考内容长度: ${thinkingContent.length} 字符`);
    }
    
    await saveResponse('claude-extended-thinking-custom-budget', { 
      response, 
      hasThinking, 
      thinkingLength: thinkingContent.length,
      requestedBudget: 3000
    }, {
      // 请求详情
    });
    
    return { 
      success: true, 
      hasThinking, 
      thinkingLength: thinkingContent.length,
      requestedBudget: 3000
    };
  } catch (error) {
    logger.error('自定义思考预算测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 测试禁用思考功能
 */
async function testDisabledThinking() {
  logger.info('开始测试禁用思考功能');
  
  try {
    const model = config.models.claude.sonnet4;
    const messages = [{
      role: 'user',
      content: '请简单介绍一下机器学习的基本概念。'
    }];

    const response = await makeClaudeRequest(model, messages, {
      thinking: {
        type: 'disabled'
      },
      max_tokens: 1000,
      temperature: 0.5
    });

    logger.info('禁用思考功能测试完成');
    
    const hasThinking = response.content && response.content.some(item => item.type === 'thinking');
    
    logger.info(`思考内容检查: ${hasThinking ? '❌ 包含（不应该包含）' : '✅ 不包含（正确）'}`);
    
    await saveResponse('claude-extended-thinking-disabled', { 
      response, 
      hasThinking, 
      shouldNotHaveThinking: !hasThinking
    }, {
      // 请求详情
    });
    
    return { 
      success: true, 
      hasThinking, 
      shouldNotHaveThinking: !hasThinking
    };
  } catch (error) {
    logger.error('禁用思考功能测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 主函数
 */
async function main() {
  logger.info('=== Claude Extended Thinking 示例开始 ===');
  
  const results = [];
  
  // 运行所有测试
  const tests = [
    { name: '基础 Extended Thinking', fn: testBasicExtendedThinking },
    { name: '流式 Extended Thinking', fn: testStreamingExtendedThinking },
    { name: '自定义思考预算', fn: testCustomThinkingBudget },
    { name: '禁用思考功能', fn: testDisabledThinking }
  ];

  for (const test of tests) {
    logger.info(`\n--- 开始测试: ${test.name} ---`);
    try {
      const result = await test.fn();
      results.push({ name: test.name, ...result });
    } catch (error) {
      logger.error(`测试 ${test.name} 失败:`, error);
      results.push({ name: test.name, success: false, error: error.message });
    }
    
    // 测试间隔
    await delay(2000);
  }

  // 输出结果摘要
  logger.info('\n=== 测试结果摘要 ===');
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  
  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    logger.info(`${status} ${result.name}: ${result.success ? '成功' : result.error}`);
    
    if (result.success && result.hasThinking !== undefined) {
      logger.info(`  思考功能: ${result.hasThinking ? '✅ 启用' : '❌ 禁用'}`);
    }
  });

  logger.info(`\n总结: ${successCount}/${totalCount} 个测试成功`);
  
  return results;
}

// 如果直接运行此文件
if (require.main === module) {
  main().catch(error => {
    logger.error('示例运行失败:', error);
    process.exit(1);
  });
}

module.exports = {
  testBasicExtendedThinking,
  testStreamingExtendedThinking,
  testCustomThinkingBudget,
  testDisabledThinking,
  main
};
