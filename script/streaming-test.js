#!/usr/bin/env node

/**
 * Gemini Code API 流式响应专项测试
 * 测试所有协议的流式输出功能
 */

const https = require('https');
const http = require('http');

const API_BASE = 'https://xxxx';
const API_KEY = 'xxxx';

// 颜色定义
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function log(color, message) {
    console.log(color + message + colors.reset);
}

function logResult(success, testName, details = '') {
    totalTests++;
    if (success) {
        passedTests++;
        log(colors.green, `✅ PASS: ${testName}`);
    } else {
        failedTests++;
        log(colors.red, `❌ FAIL: ${testName}`);
    }
    if (details) {
        console.log(`   ${details}`);
    }
    console.log('');
}

// HTTP(S) 请求函数
function makeRequest(url, options, postData) {
    return new Promise((resolve, reject) => {
        const isHttps = url.startsWith('https:');
        const client = isHttps ? https : http;
        
        const req = client.request(url, options, (res) => {
            let data = '';
            let chunks = [];
            
            res.on('data', (chunk) => {
                data += chunk;
                chunks.push({
                    timestamp: Date.now(),
                    data: chunk.toString()
                });
            });
            
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    data: data,
                    chunks: chunks
                });
            });
        });
        
        req.on('error', reject);
        
        if (postData) {
            req.write(postData);
        }
        req.end();
    });
}

// 流式响应测试函数
async function testStreamingResponse(testName, url, options, postData, expectedPatterns = []) {
    try {
        log(colors.cyan, `🔄 测试: ${testName}`);
        console.log(`URL: ${url}`);
        console.log(`方法: ${options.method || 'GET'}`);
        
        const startTime = Date.now();
        const response = await makeRequest(url, options, postData);
        const duration = Date.now() - startTime;
        
        console.log(`状态码: ${response.statusCode}`);
        console.log(`耗时: ${duration}ms`);
        console.log(`接收到 ${response.chunks.length} 个数据块`);
        
        // 检查状态码
        if (response.statusCode !== 200) {
            logResult(false, testName, `状态码错误: ${response.statusCode}, 响应: ${response.data.substring(0, 200)}`);
            return;
        }
        
        // 检查是否收到流式数据
        if (response.chunks.length < 2) {
            logResult(false, testName, `未检测到流式响应，只收到 ${response.chunks.length} 个数据块`);
            return;
        }
        
        // 显示流式数据示例
        console.log('流式数据示例:');
        response.chunks.slice(0, 3).forEach((chunk, index) => {
            console.log(`  块 ${index + 1}: ${chunk.data.substring(0, 100).replace(/\n/g, '\\n')}...`);
        });
        
        // 检查期望的模式
        let patternMatches = 0;
        if (expectedPatterns.length > 0) {
            for (const pattern of expectedPatterns) {
                if (response.data.includes(pattern)) {
                    patternMatches++;
                }
            }
            console.log(`模式匹配: ${patternMatches}/${expectedPatterns.length}`);
        }
        
        // 判断测试是否通过
        const success = response.chunks.length >= 2 && 
                       (expectedPatterns.length === 0 || patternMatches > 0);
        
        logResult(success, testName, 
            `数据块: ${response.chunks.length}, 总大小: ${response.data.length} bytes, 耗时: ${duration}ms`);
        
    } catch (error) {
        logResult(false, testName, `请求错误: ${error.message}`);
    }
}

// 主测试函数
async function runStreamingTests() {
    log(colors.blue, '🌊 Gemini Code API 流式响应专项测试');
    console.log('='.repeat(60));
    console.log('');
    
    // 1. Gemini 原生流式测试
    log(colors.yellow, '📱 1. Gemini原生流式接口测试');
    
    await testStreamingResponse(
        'Gemini流式生成 - 基础文本',
        `${API_BASE}/v1beta/models/gemini-2.5-flash:streamGenerateContent`,
        {
            method: 'POST',
            headers: {
                'x-goog-api-key': API_KEY,
                'Content-Type': 'application/json'
            }
        },
        JSON.stringify({
            contents: [{
                parts: [{ text: '请写一个关于人工智能发展历程的详细介绍，包括重要的里程碑事件' }]
            }]
        }),
        ['candidates', 'content', 'parts', 'text']
    );
    
    await testStreamingResponse(
        'Gemini流式生成 - 代码生成',
        `${API_BASE}/v1beta/models/gemini-2.5-pro:streamGenerateContent`,
        {
            method: 'POST',
            headers: {
                'x-goog-api-key': API_KEY,
                'Content-Type': 'application/json'
            }
        },
        JSON.stringify({
            contents: [{
                parts: [{ text: '请用Python实现一个完整的二叉搜索树类，包括插入、删除、查找方法，并添加详细注释' }]
            }],
            generationConfig: {
                temperature: 0.3,
                topP: 0.8,
                maxOutputTokens: 2000
            }
        }),
        ['class', 'def', 'python', 'candidates']
    );
    
    await testStreamingResponse(
        'Gemini流式生成 - 多轮对话',
        `${API_BASE}/v1beta/models/gemini-2.5-flash:streamGenerateContent`,
        {
            method: 'POST',
            headers: {
                'x-goog-api-key': API_KEY,
                'Content-Type': 'application/json'
            }
        },
        JSON.stringify({
            contents: [
                { role: 'user', parts: [{ text: '什么是深度学习?' }] },
                { role: 'model', parts: [{ text: '深度学习是机器学习的一个分支，使用多层神经网络来学习数据的复杂模式。' }] },
                { role: 'user', parts: [{ text: '请详细解释卷积神经网络的工作原理' }] }
            ]
        }),
        ['卷积', '神经网络', 'CNN', 'candidates']
    );
    
    // 2. OpenAI 兼容流式测试
    log(colors.yellow, '🔥 2. OpenAI兼容流式接口测试');
    
    await testStreamingResponse(
        'OpenAI流式聊天 - GPT-4',
        `${API_BASE}/v1/chat/completions`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            }
        },
        JSON.stringify({
            model: 'gpt-4',
            messages: [
                { role: 'system', content: '你是一个专业的软件架构师' },
                { role: 'user', content: '请设计一个高并发的微服务架构，包括服务发现、负载均衡、容错机制等组件' }
            ],
            stream: true,
            max_tokens: 1500,
            temperature: 0.7
        }),
        ['data:', 'choices', 'delta', 'content']
    );
    
    await testStreamingResponse(
        'OpenAI流式聊天 - GPT-3.5-Turbo',
        `${API_BASE}/v1/chat/completions`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            }
        },
        JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'user', content: '解释区块链技术的核心概念，包括共识算法、智能合约、去中心化等' }
            ],
            stream: true,
            max_tokens: 1000
        }),
        ['data:', 'choices', 'delta', '[DONE]']
    );
    
    await testStreamingResponse(
        'OpenAI流式聊天 - 复杂对话',
        `${API_BASE}/v1/chat/completions`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            }
        },
        JSON.stringify({
            model: 'gpt-4o',
            messages: [
                { role: 'user', content: '我想学习React' },
                { role: 'assistant', content: '很好！React是一个流行的JavaScript库，用于构建用户界面。你想从哪里开始学习？' },
                { role: 'user', content: '请从React Hooks开始，详细解释useState和useEffect的用法和最佳实践' }
            ],
            stream: true,
            temperature: 0.6,
            top_p: 0.9
        }),
        ['useState', 'useEffect', 'Hook', 'React']
    );
    
    // 3. Claude 兼容流式测试 (如果支持)
    log(colors.yellow, '🧠 3. Claude兼容流式接口测试');
    
    await testStreamingResponse(
        'Claude流式消息 - Sonnet',
        `${API_BASE}/v1/messages`,
        {
            method: 'POST',
            headers: {
                'x-api-key': API_KEY,
                'Content-Type': 'application/json'
            }
        },
        JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            messages: [
                { role: 'user', content: '请分析现代前端开发框架的演进历史，从jQuery到Vue、React、Angular的发展脉络' }
            ],
            stream: true,
            max_tokens: 2000
        }),
        ['jQuery', 'React', 'Vue', 'Angular']
    );
    
    // 4. 边界条件测试
    log(colors.yellow, '⚠️  4. 流式响应边界条件测试');
    
    await testStreamingResponse(
        '长内容流式生成',
        `${API_BASE}/v1beta/models/gemini-2.5-pro:streamGenerateContent`,
        {
            method: 'POST',
            headers: {
                'x-goog-api-key': API_KEY,
                'Content-Type': 'application/json'
            }
        },
        JSON.stringify({
            contents: [{
                parts: [{ 
                    text: '请写一篇详细的技术文章，主题是"云原生架构设计与实践"，要求包括：容器化、微服务、服务网格、DevOps、监控告警等各个方面，每个部分都要有具体的实现方案和最佳实践，文章长度至少3000字' 
                }]
            }],
            generationConfig: {
                temperature: 0.5,
                maxOutputTokens: 4000
            }
        }),
        ['容器', '微服务', 'DevOps', 'Kubernetes']
    );
    
    await testStreamingResponse(
        '快速短回答流式生成',
        `${API_BASE}/v1beta/models/gemini-2.0-flash:streamGenerateContent`,
        {
            method: 'POST',
            headers: {
                'x-goog-api-key': API_KEY,
                'Content-Type': 'application/json'
            }
        },
        JSON.stringify({
            contents: [{
                parts: [{ text: '1+1等于多少?' }]
            }],
            generationConfig: {
                maxOutputTokens: 10
            }
        }),
        ['2', 'candidates']
    );
    
    // 输出测试统计
    console.log('');
    console.log('='.repeat(60));
    log(colors.blue, '📊 流式测试统计结果');
    console.log('='.repeat(60));
    console.log(`总测试数: ${totalTests}`);
    log(colors.green, `通过数: ${passedTests}`);
    log(colors.red, `失败数: ${failedTests}`);
    log(colors.cyan, `通过率: ${Math.round(passedTests * 100 / totalTests)}%`);
    
    if (failedTests === 0) {
        log(colors.green, '🎉 所有流式测试通过！');
        process.exit(0);
    } else {
        log(colors.red, '⚠️  部分流式测试失败，请检查实现');
        process.exit(1);
    }
}

// 运行测试
runStreamingTests().catch(error => {
    log(colors.red, `测试运行错误: ${error.message}`);
    process.exit(1);
});