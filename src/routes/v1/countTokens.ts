/**
 * V1 Token Counting Route
 * 端点，用于计算文本中的 token 数量
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { throwError } from '../../middleware/error-handler';
import { ProductionLogger as Logger } from '../../utils/logger';
import { extractAndValidateApiKeys } from '../../middleware/auth/extractor';
import { MODEL_MAPPINGS } from '../../utils/constants';



/**
 * 创建 countTokens 路由
 */
export function createCountTokensRoute(): Hono {
  const app = new Hono();

  /**
   * POST /v1/count-tokens
   * 计算给定文本的 token 数量
   */
  app.post('/', async (c: Context) => {
    const logger = new Logger();
    logger.info('Token count request received');

    try {
      // 1. 身份验证
      const authResult = extractAndValidateApiKeys(c.req.raw);
      if (!authResult.hasValidKeys) {
        logger.warn('Authentication failed - no valid keys for token counting');
        throwError.authentication('Valid Gemini API key required.');
      }
      const selectedKey = authResult.validation.validKeys[0];
      logger.info('Authentication successful for token counting');

      // 2. 解析和验证请求体
      const requestBody = await c.req.json().catch(() => ({}));
      if (!requestBody.model || !requestBody.prompt) {
        throwError.validation('Fields "model" and "prompt" are required');
      }

      // 3. 映射模型名称
      const geminiModel = MODEL_MAPPINGS[requestBody.model as keyof typeof MODEL_MAPPINGS] || requestBody.model;
      logger.info('Model mapping for token count', { originalModel: requestBody.model, geminiModel });

      // 4. 构建对 Google Gemini API 的请求
      const textToCount = Array.isArray(requestBody.prompt) ? requestBody.prompt.join('\n') : requestBody.prompt;
      const geminiRequest = {
        contents: [{
          parts: [{ text: textToCount }]
        }]
      };

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:countTokens?key=${selectedKey}`; 
      
      logger.info('Calling Gemini API for token count', { model: geminiModel });

      // 5. 调用 Gemini API
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'gemini-code-api/1.0.0',
        },
        body: JSON.stringify(geminiRequest),
      });

      const responseData = await response.json() as any;

      if (!response.ok) {
        const errorMessage = responseData.error?.message || `Gemini API error: ${response.status}`;
        logger.error(`Gemini API error on token count: ${response.status}`, new Error(errorMessage));
        throwError.api(errorMessage, response.status);
      }

      // 6. 格式化并返回响应
      const openaiResponse = {
        object: 'token_count',
        model: requestBody.model,
        total_tokens: responseData.totalTokens || 0,
      };

      c.header('Content-Type', 'application/json');
      return c.json(openaiResponse, 200);

    } catch (error) {
      logger.error('Error in token counting route', error instanceof Error ? error : new Error(String(error)));
      // 错误将由全局错误处理中间件捕获和处理
      throw error;
    }
  });

  return app;
}
