/**
 * 共享工具函数
 * 为所有示例提供通用的工具函数
 */

const fs = require('fs').promises;
const path = require('path');
const { config, getApiEndpoint, createHeaders } = require('./config');

/**
 * 发送 HTTP 请求
 */
async function makeRequest(endpoint, options = {}) {
  const {
    method = 'POST',
    body,
    headers = {},
    timeout = config.api.timeout,
    retries = config.api.retries,
    returnRawResponse = false,
  } = options;

  const url = getApiEndpoint(endpoint);
  const requestHeaders = { ...createHeaders(undefined, headers) };

  const requestOptionsBase = {
    method,
    headers: requestHeaders,
  };

  if (body) {
    requestOptionsBase.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  let lastError;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🌐 发送请求 (尝试 ${attempt}/${retries}): ${method} ${url}`);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error(`Request timeout after ${timeout}ms`)), timeout);
      const requestOptions = { ...requestOptionsBase, signal: controller.signal };
      const response = await fetch(url, requestOptions);
      clearTimeout(timer);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      if (returnRawResponse) {
        // 流式等场景：直接返回原始 Response，由调用方处理 response.body
        return response;
      }

      const contentType = response.headers.get('content-type');
      let result;
      if (contentType && contentType.includes('application/json')) {
        result = await response.json();
      } else {
        result = await response.text();
      }
      
      // 优化：请求成功后添加延迟，避免过快消耗配额
      if (attempt === 1) { // 只在第一次成功请求后添加延迟
        const delayTime = Math.floor(Math.random() * 2000) + 1000; // 1-3秒随机延迟
        console.log(`⏳ 请求成功，等待 ${delayTime}ms 后继续...`);
        await new Promise(resolve => setTimeout(resolve, delayTime));
      }
      
      return result;
    } catch (error) {
      lastError = error;
      console.warn(`⚠️  请求失败 (尝试 ${attempt}/${retries}): ${error.message}`);
      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000; // 指数退避 + 随机延迟
        console.log(`⏳ 等待 ${Math.round(delay)}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/**
 * 发送 Gemini API 请求
 */
async function makeGeminiRequest(model, contents, options = {}) {
  const {
    generationConfig = {},
    tools = [],
    safetySettings = [],
    stream = false,
    // 顶层便捷参数（自动合并到 generationConfig）
    temperature,
    maxOutputTokens,
    topP,
    topK,
    stopSequences,
    // 可选思考控制（默认禁用思考对外输出）
    thinking, // { type: 'enabled'|'disabled', budget_tokens?: number }
  } = options;

  // 归一化与合并 generationConfig
  const mergedGenConfig = { ...generationConfig };
  // 默认提升输出上限，降低 MAX_TOKENS 概率
  if (mergedGenConfig.maxOutputTokens === undefined) mergedGenConfig.maxOutputTokens = 2048;
  if (temperature !== undefined) mergedGenConfig.temperature = temperature;
  if (maxOutputTokens !== undefined) mergedGenConfig.maxOutputTokens = maxOutputTokens;
  if (topP !== undefined) mergedGenConfig.topP = topP;
  if (topK !== undefined) mergedGenConfig.topK = topK;
  if (stopSequences && Array.isArray(stopSequences) && stopSequences.length > 0) {
    mergedGenConfig.stopSequences = stopSequences;
  }
  // 思考输出：默认禁用，仅显式启用时打开
  if (thinking && thinking.type === 'enabled') {
    const budget = Math.max(256, Math.min(Number(thinking.budget_tokens || 1024), Math.floor((mergedGenConfig.maxOutputTokens || 1024) * 0.5)));
    mergedGenConfig.thinkingConfig = { includeThoughts: true, thinkingBudget: budget };
  } else {
    mergedGenConfig.thinkingConfig = { includeThoughts: false };
  }

  const body = {
    contents,
    generationConfig: mergedGenConfig,
  };
  if (tools && tools.length > 0) body.tools = tools;
  if (safetySettings && safetySettings.length > 0) body.safetySettings = safetySettings;

  const endpoint = `v1beta/models/${model}:${stream ? 'streamGenerateContent' : 'generateContent'}`;
  return makeRequest(endpoint, {
    method: 'POST',
    body,
    headers: stream ? { 'Accept': 'text/event-stream' } : {},
    returnRawResponse: !!stream,
  });
}

/**
 * 发送 Claude API 请求（经统一网关适配，使用同一 KEY 头注入）
 */
async function makeClaudeRequest(model, messages, options = {}) {
  const {
    system,
    max_tokens = 2048,
    temperature = 0.7,
    top_p = 1,
    top_k = 40,
    stream = false,
    tools = [],
    tool_choice = 'auto',
    thinking = undefined,
  } = options;

  const body = {
    model,
    messages,
    max_tokens,
    temperature,
    top_p,
    top_k,
    stream,
  };
  if (system) body.system = system;
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = tool_choice;
  }
  // 可选：当启用thinking时，自动给出稳健预算（不改写内容）
  if (thinking && thinking.type === 'enabled') {
    const budget = Math.min(1024, Math.floor(max_tokens / 3));
    body.thinking = { type: 'enabled', budget_tokens: Math.max(256, budget) };
  } else if (thinking && thinking.type === 'disabled') {
    body.thinking = { type: 'disabled' };
  }

  const endpoint = 'v1/messages';
  return makeRequest(endpoint, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
      // 对于Claude请求，使用x-api-key头部
    },
  });
}

/**
 * 保存响应到文件
 */
async function saveResponse(exampleName, response, request = null) {
  if (!config.test.saveResponses) return;
  try {
    // 使用固定文件名，不包含时间戳，保持最新一份
    const filename = `${exampleName}.json`;
    const filepath = path.join(config.test.responseDir, filename);
    await fs.mkdir(config.test.responseDir, { recursive: true });
    const data = {
      timestamp: new Date().toISOString(),
      example: exampleName,
      request,
      response,
      metadata: {
        responseSize: JSON.stringify(response).length,
        hasError: response && response.error !== undefined,
      },
    };
    await fs.writeFile(filepath, JSON.stringify(data, null, 2));
    console.log(`💾 响应已保存: ${filepath}`);
  } catch (error) {
    console.warn(`⚠️  保存响应失败: ${error.message}`);
  }
}

async function readTestImage(imageName) {
  const getMime = (ext) => {
    const e = ext.toLowerCase();
    if (e === '.jpg' || e === '.jpeg') return 'image/jpeg';
    if (e === '.png') return 'image/png';
    if (e === '.webp') return 'image/webp';
    return 'application/octet-stream';
  };
  const candidatesByName = [
    imageName,
    imageName.replace(/\.[^.]+$/, '.png'),
    imageName.replace(/\.[^.]+$/, '.jpg'),
    imageName.replace(/\.[^.]+$/, '.jpeg'),
    imageName.replace(/\.[^.]+$/, '.webp'),
  ];
  for (const name of candidatesByName) {
    const p = path.join(config.paths.images, name);
    try {
      const buf = await fs.readFile(p);
      const stat = await fs.stat(p);
      if (stat.size < 1024) throw new Error('image too small');
      return { data: buf.toString('base64'), mimeType: getMime(path.extname(name)) };
    } catch {}
  }
  // 回退：优先选择体积较大的真实图片（>=10KB）
  const files = await fs.readdir(config.paths.images);
  const candidates = files.filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
  if (candidates.length === 0) {
    throw new Error(`目录 ${config.paths.images} 下未找到可用图片，且未命中 ${imageName}`);
  }
  let chosen = candidates
    .map((f) => ({ name: f }))
    .sort((a, b) => a.name.localeCompare(b.name));
  // 选择满足大小阈值的第一张
  for (const c of chosen) {
    const p = path.join(config.paths.images, c.name);
    try {
      const stat = await fs.stat(p);
      if (stat.size >= 10 * 1024) {
        const buf = await fs.readFile(p);
        console.warn(`⚠️  未找到指定图片 ${imageName}，已回退为较大文件 ${c.name}`);
        return { data: buf.toString('base64'), mimeType: getMime(path.extname(c.name)) };
      }
    } catch {}
  }
  // 都过小则使用第一张
  const fallback = candidates[0];
  const fallbackPath = path.join(config.paths.images, fallback);
  const imageBuffer = await fs.readFile(fallbackPath);
  console.warn(`⚠️  未找到合适图片，已回退为 ${fallback}`);
  return { data: imageBuffer.toString('base64'), mimeType: getMime(path.extname(fallback)) };
}

async function readTwoTestImages(name1, name2) {
  // 优先读取指定两张；失败则从目录挑选两张不同图片
  const listImages = async () => {
    const files = await fs.readdir(config.paths.images);
    return files.filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
  };

  const tryRead = async (name) => {
    const p = path.join(config.paths.images, name);
    try {
      const buf = await fs.readFile(p);
      const mime = (/\.png$/i.test(name) ? 'image/png' : /\.webp$/i.test(name) ? 'image/webp' : 'image/jpeg');
      return { ok: true, name, data: buf.toString('base64'), mimeType: mime };
    } catch {
      return { ok: false };
    }
  };

  const a = await tryRead(name1);
  const b = await tryRead(name2);

  if (a.ok && b.ok && name1 !== name2) {
    const statA = await fs.stat(path.join(config.paths.images, name1)).catch(() => null);
    const statB = await fs.stat(path.join(config.paths.images, name2)).catch(() => null);
    if (statA && statA.size >= 10 * 1024 && statB && statB.size >= 10 * 1024) {
      return [
        { data: a.data, mimeType: a.mimeType },
        { data: b.data, mimeType: b.mimeType },
      ];
    }
  }

  const candidates = await listImages();
  if (candidates.length < 2) {
    throw new Error(`目录 ${config.paths.images} 需至少包含两张图片用于比较`);
  }
  // 优先选择两个≥10KB的不同文件
  let large = [];
  for (const f of candidates) {
    try {
      const stat = await fs.stat(path.join(config.paths.images, f));
      if (stat.size >= 10 * 1024) large.push(f);
    } catch {}
    if (large.length >= 2) break;
  }
  const [first, second] = large.length >= 2 ? [large[0], large[1]] : [candidates[0], candidates[1]];

  const buf1 = await fs.readFile(path.join(config.paths.images, first));
  const buf2 = await fs.readFile(path.join(config.paths.images, second));
  if (!a.ok || !b.ok) {
    console.warn(`⚠️  未找到指定比较图片 ${name1}/${name2}，已回退为 ${first}/${second}`);
  }
  const mime1 = (/\.png$/i.test(first) ? 'image/png' : /\.webp$/i.test(first) ? 'image/webp' : 'image/jpeg');
  const mime2 = (/\.png$/i.test(second) ? 'image/png' : /\.webp$/i.test(second) ? 'image/webp' : 'image/jpeg');
  return [
    { data: buf1.toString('base64'), mimeType: mime1 },
    { data: buf2.toString('base64'), mimeType: mime2 },
  ];
}

async function readTestDocument(documentName) {
  const documentPath = path.join(config.paths.documents, documentName);
  try {
    return await fs.readFile(documentPath, 'utf-8');
  } catch (error) {
    throw new Error(`无法读取测试文档 ${documentName}: ${error.message}`);
  }
}

function withPerformanceMonitoring(fn, name) {
  return async (...args) => {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();
    try {
      const result = await fn(...args);
      const endTime = Date.now();
      const endMemory = process.memoryUsage();
      console.log(`📊 性能指标 [${name}]:`, {
        duration: `${endTime - startTime}ms`,
        memoryDelta: `${Math.round((endMemory.heapUsed - startMemory.heapUsed) / 1024)}KB`,
      });
      return result;
    } catch (error) {
      const endTime = Date.now();
      console.error(`❌ 执行失败 [${name}]:`, {
        duration: `${endTime - startTime}ms`,
        error: error.message,
      });
      throw error;
    }
  };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatOutput(data, type = 'json') {
  switch (type) {
    case 'json':
      return JSON.stringify(data, null, 2);
    case 'text':
      return typeof data === 'string' ? data : JSON.stringify(data);
    case 'compact':
      return JSON.stringify(data);
    default:
      return data;
  }
}

function validateResponse(response, expectedFields = []) {
  if (!response) throw new Error('响应为空');
  for (const field of expectedFields) {
    if (!(field in response)) throw new Error(`响应缺少必需字段: ${field}`);
  }
  return true;
}

function createTestData() {
  return {
    basicChat: { prompt: '你好，请介绍一下你自己', expectedFields: ['candidates', 'usageMetadata'] },
    imageUnderstanding: { prompt: '请描述这张图片的内容', imageName: 'test-image.jpg', expectedFields: ['candidates'] },
    toolCalling: {
      prompt: '请帮我查询今天的天气',
      tools: [{ functionDeclarations: [{ name: 'get_weather', description: '获取指定城市的天气信息', parameters: { type: 'object', properties: { city: { type: 'string' }, date: { type: 'string' } }, required: ['city'] } }] }],
      expectedFields: ['candidates'],
    },
    multiTurnChat: {
      messages: [
        { role: 'user', content: '你好' },
        { role: 'assistant', content: '你好！有什么我可以帮助你的吗？' },
        { role: 'user', content: '请介绍一下人工智能的发展历史' },
      ],
      expectedFields: ['candidates'],
    },
  };
}

class Logger {
  constructor(name) { this.name = name; }
  info(message, data = {}) { console.log(`ℹ️  [${this.name}] ${message}`, data); }
  success(message, data = {}) { console.log(`✅ [${this.name}] ${message}`, data); }
  warn(message, data = {}) { console.warn(`⚠️  [${this.name}] ${message}`, data); }
  error(message, error = null) { console.error(`❌ [${this.name}] ${message}`, error); }
  debug(message, data = {}) { if (config.logging.level === 'debug') console.log(`🐛 [${this.name}] ${message}`, data); }
}

module.exports = {
  makeRequest,
  makeGeminiRequest,
  makeClaudeRequest,
  saveResponse,
  /**
   * 保存 Base64 图片到磁盘，便于预览
   */
  saveBase64Image: async (fileName, base64Data) => {
    try {
      const outDir = path.join(config.paths.responses, 'images');
      await fs.mkdir(outDir, { recursive: true });
      const filePath = path.join(outDir, fileName);
      await fs.writeFile(filePath, Buffer.from(base64Data, 'base64'));
      console.log(`💾 已保存图片: ${filePath}`);
      return filePath;
    } catch (e) {
      console.warn(`⚠️  保存图片失败: ${e.message}`);
      return null;
    }
  },
  readTestImage,
  readTestDocument,
  withPerformanceMonitoring,
  delay,
  formatOutput,
  validateResponse,
  createTestData,
  Logger,
};
