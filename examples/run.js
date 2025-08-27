/**
 * 运行所有示例的脚本
 * 用于批量测试所有功能
 * 
 * @author Gemini Code Team
 * @date 2024-12-19
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

// 示例配置（批量执行清单需与 responses 目录的目标文件保持一致）
const EXAMPLES = {
  gemini: [
    'basic-chat.js',              // gemini-基础对话.json
    'image-upload.js',            // 图片上传和理解
    'web-access.js',              // 网页内容访问
    'tool-calling.js',            // 工具调用
    'multi-turn-chat.js',         // 多轮对话
    'structured-output.js',       // 结构化输出
    'long-context.js',            // 长上下文
    'streaming.js',               // 流式响应
  ],
  claude: [
    'basic-messages.js',          // claude-基础消息.json
    'image-understanding.js',     // 图片理解
    'tool-use.js',                // 工具使用
    'multi-turn.js',              // 多轮对话
    'system-messages.js',         // 系统消息
    'streaming.js',               // 流式响应
    'extended-thinking.js',       // Extended Thinking
  ],
};

// 测试结果
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  details: {},
};

/**
 * 运行单个示例
 */
async function runExample(type, filename) {
  return new Promise((resolve) => {
    const examplePath = path.join(__dirname, type, filename);
    const startTime = Date.now();
    
    console.log(`\n🚀 运行 ${type}/${filename}...`);
    
    const child = spawn('node', [examplePath], {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' },
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      const success = code === 0;
      
      if (success) {
        console.log(`✅ ${type}/${filename} 成功 (${duration}ms)`);
        results.passed++;
      } else {
        console.log(`❌ ${type}/${filename} 失败 (${duration}ms)`);
        console.log(`错误信息: ${stderr}`);
        results.failed++;
      }
      
      results.total++;
      results.details[`${type}/${filename}`] = {
        success,
        duration,
        code,
        stdout: stdout.slice(-500), // 只保留最后500字符
        stderr,
      };
      
      resolve();
    });
    
    child.on('error', (error) => {
      console.log(`❌ ${type}/${filename} 启动失败: ${error.message}`);
      results.failed++;
      results.total++;
      results.details[`${type}/${filename}`] = {
        success: false,
        duration: 0,
        code: -1,
        error: error.message,
      };
      resolve();
    });
  });
}

/**
 * 检查文件是否存在
 */
async function checkFileExists(filepath) {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 运行所有示例
 */
async function runAllExamples() {
  console.log('🚀 开始运行所有示例...\n');
  
  const startTime = Date.now();
  
  // 运行 Gemini 示例
  console.log('🔵 运行 Gemini 示例:');
  for (const filename of EXAMPLES.gemini) {
    const filepath = path.join(__dirname, 'gemini', filename);
    if (await checkFileExists(filepath)) {
      await runExample('gemini', filename);
      // 示例间隔
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      console.log(`⏭️  ${filename} 不存在，跳过`);
      results.skipped++;
    }
  }
  
  // 运行 Claude 示例
  console.log('\n🟣 运行 Claude 示例:');
  for (const filename of EXAMPLES.claude) {
    const filepath = path.join(__dirname, 'claude', filename);
    if (await checkFileExists(filepath)) {
      await runExample('claude', filename);
      // 示例间隔
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      console.log(`⏭️  ${filename} 不存在，跳过`);
      results.skipped++;
    }
  }
  
  const totalDuration = Date.now() - startTime;
  
  // 输出总结
  console.log('\n📊 测试总结:');
  console.log('─'.repeat(60));
  console.log(`总测试数: ${results.total}`);
  console.log(`成功: ${results.passed} ✅`);
  console.log(`失败: ${results.failed} ❌`);
  console.log(`跳过: ${results.skipped} ⏭️`);
  console.log(`成功率: ${results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : 0}%`);
  console.log(`总耗时: ${totalDuration}ms`);
  
  // 输出失败详情
  if (results.failed > 0) {
    console.log('\n❌ 失败详情:');
    for (const [example, detail] of Object.entries(results.details)) {
      if (!detail.success) {
        console.log(`  ${example}: ${detail.error || `退出码 ${detail.code}`}`);
      }
    }
  }
  
  // 保存结果到文件
  try {
    const resultFile = path.join(__dirname, 'test-results.json');
    await fs.writeFile(resultFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: {
        total: results.total,
        passed: results.passed,
        failed: results.failed,
        skipped: results.skipped,
        successRate: results.total > 0 ? (results.passed / results.total) : 0,
        duration: totalDuration,
      },
      details: results.details,
    }, null, 2));
    
    console.log(`\n💾 测试结果已保存到: ${resultFile}`);
  } catch (error) {
    console.log(`\n⚠️  保存测试结果失败: ${error.message}`);
  }
  
  // 返回退出码
  process.exit(results.failed > 0 ? 1 : 0);
}

/**
 * 运行特定类型的示例
 */
async function runTypeExamples(type) {
  if (!EXAMPLES[type]) {
    console.error(`❌ 不支持的类型: ${type}`);
    console.log(`支持的类型: ${Object.keys(EXAMPLES).join(', ')}`);
    process.exit(1);
  }
  
  console.log(`🚀 开始运行 ${type} 示例...\n`);
  
  const startTime = Date.now();
  
  for (const filename of EXAMPLES[type]) {
    const filepath = path.join(__dirname, type, filename);
    if (await checkFileExists(filepath)) {
      await runExample(type, filename);
      // 示例间隔
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      console.log(`⏭️  ${filename} 不存在，跳过`);
      results.skipped++;
    }
  }
  
  const totalDuration = Date.now() - startTime;
  
  // 输出总结
  console.log(`\n📊 ${type} 测试总结:`);
  console.log('─'.repeat(60));
  console.log(`总测试数: ${results.total}`);
  console.log(`成功: ${results.passed} ✅`);
  console.log(`失败: ${results.failed} ❌`);
  console.log(`跳过: ${results.skipped} ⏭️`);
  console.log(`成功率: ${results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : 0}%`);
  console.log(`总耗时: ${totalDuration}ms`);
  
  process.exit(results.failed > 0 ? 1 : 0);
}

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
🚀 Gemini Code API 示例运行器

用法:
  node run-all.js                    # 运行所有示例
  node run-all.js gemini            # 只运行 Gemini 示例
  node run-all.js claude            # 只运行 Claude 示例
  node run-all.js --help            # 显示帮助信息

环境变量:
  确保设置了以下环境变量:
  - GEMINI_API_KEY: Gemini API 密钥
  - CLAUDE_API_KEY: Claude API 密钥 (可选)
  - API_BASE_URL: API 端点 (默认: http://localhost:8787)

示例:
  # 设置环境变量
  export GEMINI_API_KEY="your_key_here"
  export CLAUDE_API_KEY="your_key_here"
  
  # 运行所有示例
  node run-all.js
  
  # 只运行 Gemini 示例
  node run-all.js gemini
`);
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }
  
  if (args.length === 0) {
    // 运行所有示例
    await runAllExamples();
  } else if (args.length === 1) {
    // 运行特定类型的示例
    await runTypeExamples(args[0]);
  } else {
    console.error('❌ 参数错误');
    showHelp();
    process.exit(1);
  }
}

// 如果直接运行此文件，则执行主函数
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ 运行失败:', error);
    process.exit(1);
  });
}

module.exports = {
  runAllExamples,
  runTypeExamples,
  EXAMPLES,
};
