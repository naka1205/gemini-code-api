/**
 * V1Beta Gemini生成内容路由
 * Gemini原生API透传端点
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { detectClientType } from '@/middleware/auth/detector.js';
import { extractAndValidateApiKeys } from '@/middleware/auth/extractor.js';
import { throwError } from '@/middleware/error-handler.js';
import { getLogger } from '@/middleware/logger.js';

/**
 * 创建Gemini生成内容路由
 */
export function createGenerateContentRoute(): Hono {
  const app = new Hono();

  /**
   * POST /v1beta/models/{model}:{action}
   * Gemini原生API端点统一处理
   */
  app.post('/models/*', async (c: Context) => {
    const logger = getLogger(c);
    const path = c.req.path;
    const modelAndAction = path.split('/models/')[1];
    
    // 解析模型名和动作
    if (!modelAndAction || !modelAndAction.includes(':')) {
      throwError.validation('Invalid model path format. Expected: /models/{model}:action');
    }
    
    const [model, action] = modelAndAction.split(':');
    
    logger.info(`Gemini ${action} request for model: ${model}`);

    try {
      // 根据动作分发到不同的处理逻辑
      switch (action) {
        case 'generateContent':
          return await handleGenerateContent(c, model, logger);
        case 'streamGenerateContent':
          return await handleStreamGenerateContent(c, model, logger);
        case 'embedContent':
          return await handleEmbedContent(c, model, logger);
        default:
          throwError.validation(`Unsupported action: ${action}. Supported actions: generateContent, streamGenerateContent, embedContent`);
      }
    } catch (error) {
      throw error;
    }
  });

  /**
   * OPTIONS处理
   */
  app.options('/models/*', async () => {
    return new Response('', { status: 204 });
  });

  return app;
}

/**
 * 处理generateContent请求
 */
async function handleGenerateContent(c: Context, model: string, logger: any): Promise<Response> {
  try {
    // 直接代理到Gemini API（简化解决方案）
    logger.info('Using direct proxy to Gemini API...');
    
    // 认证
    const detectionResult = detectClientType(c.req.raw);
    const authResult = extractAndValidateApiKeys(c.req.raw, detectionResult);
    
    if (!authResult.hasValidKeys) {
      throwError.authentication(authResult.recommendation || 'Valid Gemini API keys required');
    }

    // 获取请求体
    const requestBody = await c.req.json().catch(() => ({}));
    logger.info('Request body parsed', { hasContents: !!requestBody.contents });

    // 验证必需字段
    if (!requestBody.contents || !Array.isArray(requestBody.contents) || requestBody.contents.length === 0) {
      throwError.validation('Field "contents" is required and must be a non-empty array');
    }

    // 选择API密钥（简单轮询）
    const selectedKey = authResult.validation.validKeys[0];
    
    // 构建Gemini API URL
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${selectedKey}`;
    
    logger.info('Calling Gemini API directly', { model, url: geminiUrl.replace(selectedKey, '***') });

    // 直接调用Gemini API
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'gemini-code-api/2.0.0',
      },
      body: JSON.stringify(requestBody),
    });

    const responseData = await response.json() as any;

    if (!response.ok) {
      logger.error(`Gemini API error: ${response.status}`, new Error(`API Error: ${responseData.error?.message || 'Unknown error'}`));
      throwError.api(
        responseData.error?.message || `Gemini API error: ${response.status}`,
        response.status
      );
    }

    logger.info(`Gemini API call successful: ${response.status}`);

    // 设置响应头
    c.header('Content-Type', 'application/json');
    c.header('x-powered-by', 'gemini-code-api');

    return c.json(responseData, response.status as any);
  } catch (error) {
    logger.error('Direct proxy failed:', error as Error);
    throw error;
  }
}

/**
 * 处理streamGenerateContent请求
 */
async function handleStreamGenerateContent(c: Context, model: string, logger: any): Promise<Response> {
  try {
    // 直接代理到Gemini API（简化流式解决方案）
    logger.info('Using direct proxy to Gemini API for streaming...');
    
    // 认证
    const detectionResult = detectClientType(c.req.raw);
    const authResult = extractAndValidateApiKeys(c.req.raw, detectionResult);
    
    if (!authResult.hasValidKeys) {
      throwError.authentication(authResult.recommendation || 'Valid Gemini API keys required');
    }

    // 获取请求体
    const requestBody = await c.req.json().catch(() => ({}));
    logger.info('Request body parsed', { hasContents: !!requestBody.contents });

    // 验证必需字段
    if (!requestBody.contents || !Array.isArray(requestBody.contents) || requestBody.contents.length === 0) {
      throwError.validation('Field "contents" is required and must be a non-empty array');
    }

    // 选择API密钥
    const selectedKey = authResult.validation.validKeys[0];
    
    // 构建Gemini API URL
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${selectedKey}`;
    
    logger.info('Calling Gemini streaming API directly', { model, url: geminiUrl.replace(selectedKey, '***') });

    // 直接调用Gemini流式API
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'gemini-code-api/2.0.0',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as any;
      logger.error(`Gemini streaming API error: ${response.status}`, new Error(`API Error: ${errorData.error?.message || 'Unknown error'}`));
      throwError.api(
        errorData.error?.message || `Gemini API error: ${response.status}`,
        response.status
      );
    }

    logger.info(`Gemini streaming API call successful: ${response.status}`);

    // 设置流式响应头
    c.header('Content-Type', 'application/json');
    c.header('x-powered-by', 'gemini-code-api');
    c.header('Transfer-Encoding', 'chunked');

    // 直接转发流式响应
    return new Response(response.body, {
      status: response.status,
      headers: c.res.headers,
    });
  } catch (error) {
    throw error;
  }
}

/**
 * 处理embedContent请求
 */
async function handleEmbedContent(c: Context, model: string, logger: any): Promise<Response> {
  const startTime = Date.now();

  try {
    logger.info(`Gemini embedContent request for model: ${model}`);

    // 1. 检测客户端类型
    const detectionResult = detectClientType(c.req.raw);
    c.set('clientType', detectionResult.clientType);

    // 2. 提取和验证API密钥
    const authResult = extractAndValidateApiKeys(c.req.raw, detectionResult);
    
    if (!authResult.hasValidKeys) {
      throwError.authentication('Valid Gemini API keys required');
    }

    // 3. 获取请求参数并验证
    const requestBody = await c.req.json().catch(() => ({}));
    c.set('model', model);

    if (!requestBody.content) {
      throwError.validation('Field "content" is required for embedContent requests');
    }

    // 4. 直接调用Gemini嵌入API（原生透传）
    const selectedKey = authResult.validation.validKeys[0]; // 嵌入请求使用第一个可用密钥
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${selectedKey}`;

    logger.info('Calling Gemini embedContent API', { model });

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'gemini-code-api/2.0.0',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as any;
      throwError.api(
        errorData.error?.message || `Gemini API error: ${response.status}`,
        response.status
      );
    }

    const result = await response.json() as any;

    // 记录成功指标
    const responseTime = Date.now() - startTime;
    logger.info('Gemini embedContent completed successfully', {
      responseTime,
      model,
    });

    return c.json(result, response.status as any);
  } catch (error) {
    throw error;
  }
}