/**
 * V1Beta Gemini生成内容路由
 * Gemini原生API透传端点
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { detectClientType } from '../../middleware/auth/detector.js';
import { extractAndValidateApiKeys } from '../../middleware/auth/extractor.js';
import { throwError } from '../../middleware/error-handler.js';
import { getLogger } from '../../middleware/logger.js';

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
      let detectionResult;
      let authResult;
      
      try {
        logger.debug('Starting client type detection');
        detectionResult = detectClientType(c.req.raw);
        logger.debug('Client type detected', { 
          clientType: detectionResult.clientType, 
          confidence: detectionResult.confidence,
          reason: detectionResult.reason 
        });
        
        logger.debug('Starting API key extraction and validation');
        authResult = extractAndValidateApiKeys(c.req.raw, detectionResult);
        logger.debug('API key validation result', {
          hasValidKeys: authResult.hasValidKeys,
          totalKeys: authResult.extraction.totalKeys,
          validKeysCount: authResult.validation.validKeys.length,
          invalidKeysCount: authResult.validation.invalidKeys.length,
          warnings: authResult.validation.warnings,
          source: authResult.extraction.source
        });
      } catch (error) {
        logger.error('Authentication detection failed', error instanceof Error ? error : new Error(String(error)), {
          errorType: typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        throwError.authentication('Authentication failed. Please provide a valid Gemini API key starting with "AI".');
      }
      
      if (!authResult!.hasValidKeys) {
        const errorMessage = authResult!.validation.warnings.length > 0 
          ? authResult!.validation.warnings[0]
          : authResult!.recommendation || 'Valid Gemini API key required. API key must start with "AI".';
        logger.warn('Authentication failed - no valid keys', {
          errorMessage,
          warnings: authResult!.validation.warnings,
          recommendation: authResult!.recommendation,
          extraction: authResult!.extraction
        });
        throwError.authentication(errorMessage);
      }
      
      logger.info('Authentication successful', {
        validKeysCount: authResult!.validation.validKeys.length,
        clientType: detectionResult!.clientType
      });

    // 获取请求体
    const requestBody = await c.req.json().catch(() => ({}));
    logger.info('Request body parsed', { hasContents: !!requestBody.contents });

    // 验证必需字段
    if (!requestBody.contents || !Array.isArray(requestBody.contents) || requestBody.contents.length === 0) {
      throwError.validation('Field "contents" is required and must be a non-empty array');
    }

    // 处理思考配置 - 默认启用思考功能
    if (requestBody.generationConfig) {
      const maxTokens = requestBody.generationConfig.maxOutputTokens || 8192;
      const thinkingBudget = Math.max(1024, Math.min(maxTokens - 1, 8192));
      
      // 添加思考配置
      requestBody.generationConfig.thinkingConfig = {
        includeThoughts: true,
        thinkingBudget: thinkingBudget
      };
      
      logger.info('Added thinking config', { 
        maxTokens, 
        thinkingBudget,
        includeThoughts: true 
      });
    } else {
      // 如果没有generationConfig，创建一个包含思考配置的
      requestBody.generationConfig = {
        thinkingConfig: {
          includeThoughts: true,
          thinkingBudget: 8192
        }
      };
      
      logger.info('Created generation config with thinking', { 
        thinkingBudget: 8192,
        includeThoughts: true 
      });
    }

    // 选择API密钥 - 确保安全访问
    if (!authResult!.validation.validKeys || authResult!.validation.validKeys.length === 0) {
      throwError.authentication('No valid API keys available');
    }

    const selectedKey = authResult!.validation.validKeys[0];
    if (!selectedKey) {
      throwError.authentication('Selected API key is invalid');
    }
    
    // 构建Gemini API URL
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    
    logger.info('Calling Gemini API directly', { model, url: geminiUrl });

    // 直接调用Gemini API
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': selectedKey,
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
    let detectionResult;
    let authResult;
    
    try {
       detectionResult = detectClientType(c.req.raw);
       authResult = extractAndValidateApiKeys(c.req.raw, detectionResult);
     } catch (error) {
       logger.error('Authentication detection failed', error instanceof Error ? error : new Error(String(error)));
        throwError.authentication('Authentication failed. Please provide a valid Gemini API key starting with "AI".');
     }
    
    if (!authResult!.hasValidKeys) {
      const errorMessage = authResult!.validation.warnings.length > 0 
        ? authResult!.validation.warnings[0]
        : authResult!.recommendation || 'Valid Gemini API key required. API key must start with "AI".';
      throwError.authentication(errorMessage);
    }

    // 获取请求体
    const requestBody = await c.req.json().catch(() => ({}));
    logger.info('Request body parsed', { hasContents: !!requestBody.contents });

    // 验证必需字段
    if (!requestBody.contents || !Array.isArray(requestBody.contents) || requestBody.contents.length === 0) {
      throwError.validation('Field "contents" is required and must be a non-empty array');
    }

    // 处理思考配置 - 默认启用思考功能
    if (requestBody.generationConfig) {
      const maxTokens = requestBody.generationConfig.maxOutputTokens || 8192;
      const thinkingBudget = Math.max(1024, Math.min(maxTokens - 1, 8192));
      
      // 添加思考配置
      requestBody.generationConfig.thinkingConfig = {
        includeThoughts: true,
        thinkingBudget: thinkingBudget
      };
      
      logger.info('Added thinking config for streaming', { 
        maxTokens, 
        thinkingBudget,
        includeThoughts: true 
      });
    } else {
      // 如果没有generationConfig，创建一个包含思考配置的
      requestBody.generationConfig = {
        thinkingConfig: {
          includeThoughts: true,
          thinkingBudget: 8192
        }
      };
      
      logger.info('Created generation config with thinking for streaming', { 
        thinkingBudget: 8192,
        includeThoughts: true 
      });
    }

    // 选择API密钥 - 确保安全访问
    if (!authResult!.validation.validKeys || authResult!.validation.validKeys.length === 0) {
      throwError.authentication('No valid API keys available');
    }

    const selectedKey = authResult!.validation.validKeys[0];
    if (!selectedKey) {
      throwError.authentication('Selected API key is invalid');
    }
    
    // 构建Gemini API URL
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;
    
    logger.info('Calling Gemini streaming API directly', { model, url: geminiUrl });

    // 直接调用Gemini流式API
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'x-goog-api-key': selectedKey,
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
    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');
    c.header('x-powered-by', 'gemini-code-api');

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

    // 1. 检测客户端类型和验证API密钥
    let detectionResult;
    let authResult;
    
    try {
       detectionResult = detectClientType(c.req.raw);
       authResult = extractAndValidateApiKeys(c.req.raw, detectionResult);
     } catch (error) {
       logger.error('Authentication detection failed', error instanceof Error ? error : new Error(String(error)));
        throwError.authentication('Authentication failed. Please provide a valid Gemini API key starting with "AI".');
     }
    
    c.set('clientType', detectionResult!.clientType);
    
    if (!authResult!.hasValidKeys) {
      const errorMessage = authResult!.validation.warnings.length > 0 
        ? authResult!.validation.warnings[0]
        : authResult!.recommendation || 'Valid Gemini API key required. API key must start with "AI".';
      throwError.authentication(errorMessage);
    }

    // 3. 获取请求参数并验证
    const requestBody = await c.req.json().catch(() => ({}));
    c.set('model', model);

    if (!requestBody.content) {
      throwError.validation('Field "content" is required for embedContent requests');
    }

    // 4. 直接调用Gemini嵌入API（原生透传）
    // 选择API密钥 - 确保安全访问
    if (!authResult!.validation.validKeys || authResult!.validation.validKeys.length === 0) {
      throwError.authentication('No valid API keys available');
    }

    const selectedKey = authResult!.validation.validKeys[0]; // 嵌入请求使用第一个可用密钥
    if (!selectedKey) {
      throwError.authentication('Selected API key is invalid');
    }
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`;

    logger.info('Calling Gemini embedContent API', { model });

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': selectedKey,
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