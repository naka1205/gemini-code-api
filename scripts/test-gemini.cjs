#!/usr/bin/env node

const https = require('https');
const http = require('http');
const config = require('./config.cjs');

class GeminiNativeTester {
  constructor() {
    this.gateway = config.GATEWAY;
    this.geminiConfig = config.GEMINI_NATIVE;
    this.common = config.COMMON;
  }

  async makeRequest(prompt, retries = 0) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: this.geminiConfig.TEMPERATURE,
          maxOutputTokens: this.geminiConfig.MAX_TOKENS
        }
      });

      const baseUrl = this.gateway.URL_BASE;
      const url = new URL(baseUrl + this.geminiConfig.ENDPOINT);
      const isHttps = url.protocol === 'https:';
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.gateway.GEMINI_API_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: this.common.TIMEOUT
      };

      const client = isHttps ? https : http;
      const req = client.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (res.statusCode === 200) {
              resolve({
                success: true,
                data: response,
                statusCode: res.statusCode
              });
            } else {
              resolve({
                success: false,
                error: response.error || response || 'Unknown error',
                statusCode: res.statusCode
              });
            }
          } catch (error) {
            resolve({
              success: false,
              error: 'Invalid JSON response',
              rawData: data,
              statusCode: res.statusCode
            });
          }
        });
      });

      req.on('error', (error) => {
        if (retries < this.common.MAX_RETRIES) {
          console.log(`重试 ${retries + 1}/${this.common.MAX_RETRIES}...`);
          setTimeout(() => {
            this.makeRequest(prompt, retries + 1).then(resolve).catch(reject);
          }, this.common.REQUEST_DELAY);
        } else {
          reject({
            success: false,
            error: error.message
          });
        }
      });

      req.on('timeout', () => {
        req.destroy();
        reject({
          success: false,
          error: 'Request timeout'
        });
      });

      req.write(postData);
      req.end();
    });
  }

  async testHealthCheck() {
    return new Promise((resolve, reject) => {
      const baseUrl = this.gateway.URL_BASE;
      const url = new URL(baseUrl + config.HEALTH_CHECK.ENDPOINT);
      const isHttps = url.protocol === 'https:';
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'GET',
        timeout: this.common.TIMEOUT
      };

      const client = isHttps ? https : http;
      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          resolve({
            success: res.statusCode === 200,
            statusCode: res.statusCode,
            data: data
          });
        });
      });

      req.on('error', (error) => {
        reject({ success: false, error: error.message });
      });

      req.on('timeout', () => {
        req.destroy();
        reject({ success: false, error: 'Health check timeout' });
      });

      req.end();
    });
  }

  async runTests() {
    console.log('💎 API Gateway Gemini原生接口测试');
    console.log('='.repeat(50));
    
    if (!this.gateway.GEMINI_API_KEY) {
      console.error('❌ 错误: 未设置 GEMINI_API_KEY 环境变量');
      console.log('💡 该网关使用Gemini作为后端，需要Gemini API密钥');
      return;
    }

    const baseUrl = this.gateway.URL_BASE;
    console.log(`🔗 网关地址: ${baseUrl}`);
    console.log(`📋 测试端点: ${this.geminiConfig.ENDPOINT}`);
    console.log(`🎯 使用模型: ${this.geminiConfig.MODEL}`);
    console.log(`⏱️  超时时间: ${this.common.TIMEOUT}ms`);
    console.log(`🌡️  温度: ${this.geminiConfig.TEMPERATURE}`);

    // 健康检查
    console.log('\n🏥 执行健康检查...');
    try {
      const health = await this.testHealthCheck();
      if (health.success) {
        console.log('✅ 健康检查通过');
      } else {
        console.log(`❌ 健康检查失败 (状态码: ${health.statusCode})`);
        return;
      }
    } catch (error) {
      console.log(`❌ 健康检查异常: ${error.error || error.message}`);
      return;
    }

    console.log('\n📝 开始API测试...');
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < config.TEST_PROMPTS.length; i++) {
      const prompt = config.TEST_PROMPTS[i];
      console.log(`\n测试 ${i + 1}/${config.TEST_PROMPTS.length}: "${prompt}"`);
      console.log('-'.repeat(40));
      
      const startTime = Date.now();
      
      try {
        const result = await this.makeRequest(prompt);
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        if (result.success) {
          successCount++;
          console.log(`✅ 成功 (${duration}ms)`);
          
          const candidate = result.data.candidates && result.data.candidates[0];
          if (candidate && candidate.content && candidate.content.parts) {
            const content = candidate.content.parts[0].text;
            console.log(`📝 响应: ${content.substring(0, 100)}...`);
            
            if (result.data.usageMetadata) {
              const usage = result.data.usageMetadata;
              console.log(`💰 Token使用: 提示${usage.promptTokenCount} + 候选${usage.candidatesTokenCount} = ${usage.totalTokenCount}`);
            }
          } else {
            console.log(`📝 响应: ${JSON.stringify(result.data).substring(0, 100)}...`);
          }
        } else {
          failCount++;
          console.log(`❌ 失败 (${duration}ms)`);
          console.log(`📝 错误: ${JSON.stringify(result.error).substring(0, 200)}`);
          console.log(`🔍 状态码: ${result.statusCode}`);
          if (result.rawData) {
            console.log(`🔍 原始数据: ${result.rawData.substring(0, 200)}...`);
          }
        }
      } catch (error) {
        failCount++;
        console.log(`❌ 异常: ${error.error || error.message || JSON.stringify(error)}`);
      }
      
      if (i < config.TEST_PROMPTS.length - 1) {
        console.log(`⏳ 等待 ${this.common.REQUEST_DELAY}ms...`);
        await new Promise(resolve => setTimeout(resolve, this.common.REQUEST_DELAY));
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 Gemini原生接口测试结果:');
    console.log(`✅ 成功: ${successCount}/${config.TEST_PROMPTS.length}`);
    console.log(`❌ 失败: ${failCount}/${config.TEST_PROMPTS.length}`);
    console.log(`📈 成功率: ${((successCount / config.TEST_PROMPTS.length) * 100).toFixed(1)}%`);
  }
}

if (require.main === module) {
  const tester = new GeminiNativeTester();
  tester.runTests().catch(console.error);
}

module.exports = GeminiNativeTester;