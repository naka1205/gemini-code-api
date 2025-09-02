#!/usr/bin/env node

const OpenAICompatTester = require('./test-openai.js');
const ClaudeCompatTester = require('./test-claude.js');
const GeminiNativeTester = require('./test-gemini.js');

class GatewayTesterRunner {
  constructor() {
    this.testers = {
      openai: new OpenAICompatTester(),
      claude: new ClaudeCompatTester(),
      gemini: new GeminiNativeTester()
    };
  }

  async runSingleTest(provider) {
    if (!this.testers[provider]) {
      console.error(`❌ 未知的API接口类型: ${provider}`);
      console.log('💡 支持的接口类型: openai, claude, gemini');
      return;
    }

    console.log(`\n🚀 开始测试 ${provider.toUpperCase()} 兼容接口...`);
    const startTime = Date.now();
    
    try {
      await this.testers[provider].runTests();
    } catch (error) {
      console.error(`❌ ${provider.toUpperCase()} 接口测试出错:`, error.message || error);
    }
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    console.log(`\n⏱️ ${provider.toUpperCase()} 接口测试完成，用时: ${duration}秒`);
  }

  async runAllTests() {
    console.log('🌟 Gemini Code API Gateway 综合测试工具');
    console.log('='.repeat(60));
    console.log(`📅 测试时间: ${new Date().toLocaleString('zh-CN')}`);
    console.log('📋 测试接口: OpenAI兼容, Claude兼容, Gemini原生');
    console.log('🏗️  网关架构: Gemini后端 -> 多协议兼容前端');
    console.log('='.repeat(60));

    const overallStartTime = Date.now();

    for (const [provider, tester] of Object.entries(this.testers)) {
      console.log(`\n${'🔄'.repeat(20)}`);
      await this.runSingleTest(provider);
      console.log(`${'🔄'.repeat(20)}\n`);
      
      // 测试间隔
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const overallEndTime = Date.now();
    const totalDuration = ((overallEndTime - overallStartTime) / 1000).toFixed(2);

    console.log('\n' + '='.repeat(60));
    console.log('🎯 API网关全接口测试完成');
    console.log(`⏱️ 总用时: ${totalDuration}秒`);
    console.log('💡 所有接口都通过同一个Gemini后端提供服务');
    console.log('='.repeat(60));
  }

  showHelp() {
    console.log('🤖 Gemini Code API Gateway 测试工具使用说明');
    console.log('='.repeat(60));
    console.log('');
    console.log('📖 使用方法:');
    console.log('  node test-runner.js [interface_type]');
    console.log('');
    console.log('🔧 参数说明:');
    console.log('  interface_type - API接口类型 (可选)');
    console.log('    • openai  - 测试 OpenAI 兼容接口 (/v1/chat/completions)');
    console.log('    • claude  - 测试 Claude 兼容接口 (/v1/messages)');
    console.log('    • gemini  - 测试 Gemini 原生接口 (/v1beta/models/*/generateContent)');
    console.log('    • all     - 测试所有接口类型 (默认)');
    console.log('');
    console.log('💡 示例:');
    console.log('  node test-runner.js            # 测试所有接口');
    console.log('  node test-runner.js all        # 测试所有接口');  
    console.log('  node test-runner.js openai     # 仅测试 OpenAI 兼容接口');
    console.log('  node test-runner.js claude     # 仅测试 Claude 兼容接口');
    console.log('  node test-runner.js gemini     # 仅测试 Gemini 原生接口');
    console.log('');
    console.log('⚙️  环境变量配置:');
    console.log('  GEMINI_API_KEY   - Gemini API 密钥 (必需)');
    console.log('  GATEWAY_URL      - 网关部署地址 (可选，默认使用配置文件中的地址)');
    console.log('');
    console.log('📁 配置文件: ./config.cjs');
    console.log('');
    console.log('🏗️  项目架构:');
    console.log('  本工具测试的是 Gemini Code API Gateway，该网关:');
    console.log('  • 使用 Gemini 作为统一后端');
    console.log('  • 对外提供 OpenAI、Claude、Gemini 三种兼容接口');  
    console.log('  • 运行在 Cloudflare Workers 上');
    console.log('');
  }
}

async function main() {
  const runner = new GatewayTesterRunner();
  const args = process.argv.slice(2);
  
  if (args.includes('-h') || args.includes('--help')) {
    runner.showHelp();
    return;
  }

  const interfaceType = args[0];
  
  if (!interfaceType || interfaceType === 'all') {
    await runner.runAllTests();
  } else if (['openai', 'claude', 'gemini'].includes(interfaceType.toLowerCase())) {
    await runner.runSingleTest(interfaceType.toLowerCase());
  } else {
    console.error(`❌ 未知的接口类型: ${interfaceType}`);
    console.log('💡 使用 --help 查看使用说明');
    runner.showHelp();
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = GatewayTesterRunner;