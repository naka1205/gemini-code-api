/**
 * V1 消息路由
 * Claude /v1/messages API兼容端点
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { detectClientType } from '../../middleware/auth/detector.js';
import { extractAndValidateApiKeys } from '../../middleware/auth/extractor.js';
import { throwError } from '../../middleware/error-handler.js';
import { getLogger } from '../../middleware/logger.js';
import { MODEL_MAPPINGS } from '../../utils/constants.js';

/**
 * 创建消息路由
 */
export function createMessagesRoute(): Hono {
  const app = new Hono();

  /**
   * POST /v1/messages
   * Claude消息API兼容端点
   */
  app.post('/', async (c: Context) => {
    const logger = getLogger(c);

    try {
      logger.info('Claude messages request');

      // 认证
      const detectionResult = detectClientType(c.req.raw);
      const authResult = extractAndValidateApiKeys(c.req.raw, detectionResult);
      
      if (!authResult.hasValidKeys) {
        throwError.authentication(authResult.recommendation || 'Valid Gemini API keys required');
      }

      // 获取请求体
      const requestBody = await c.req.json().catch(() => ({}));
      logger.info('Request body parsed', { 
        model: requestBody.model, 
        hasMessages: !!requestBody.messages 
      });

      // 验证必需字段
      if (!requestBody.model || !requestBody.messages || !Array.isArray(requestBody.messages)) {
        throwError.validation('Fields "model" and "messages" are required');
      }

      // 映射Claude模型到Gemini模型
      const geminiModel = MODEL_MAPPINGS[requestBody.model as keyof typeof MODEL_MAPPINGS] || 'gemini-2.5-flash';
      logger.info('Model mapping', { claudeModel: requestBody.model, geminiModel });

      // 转换Claude格式的消息到Gemini格式
      const geminiRequest = {
        contents: requestBody.messages.map((message: any) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content || '' }]
        })).filter((content: any) => content.parts[0].text) // 过滤空消息
      };

      // 选择API密钥 - 确保安全访问
      if (!authResult.validation.validKeys || authResult.validation.validKeys.length === 0) {
        throwError.authentication('No valid API keys available');
      }
      
      const selectedKey = authResult.validation.validKeys[0];
      if (!selectedKey) {
        throwError.authentication('Selected API key is invalid');
      }
      
      // 构建Gemini API URL
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${selectedKey}`;
      
      logger.info('Calling Gemini API', { model: geminiModel, url: geminiUrl.replace(selectedKey, '***') });

      // 调用Gemini API
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'gemini-code-api/2.0.0',
        },
        body: JSON.stringify(geminiRequest),
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

      // 转换Gemini响应到Claude格式
      const claudeResponse = {
        id: responseData.responseId || 'msg_' + Date.now(),
        type: 'message',
        role: 'assistant',
        content: responseData.candidates && responseData.candidates[0] ? 
          [{ type: 'text', text: responseData.candidates[0].content?.parts?.[0]?.text || '' }] :
          [{ type: 'text', text: 'Error: No response from Gemini API' }],
        model: requestBody.model,
        stop_reason: responseData.candidates?.[0]?.finishReason === 'STOP' ? 'end_turn' :
                    responseData.candidates?.[0]?.finishReason === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: responseData.usageMetadata?.promptTokenCount || 0,
          output_tokens: responseData.usageMetadata?.candidatesTokenCount || 0
        }
      };

      // 设置响应头
      c.header('Content-Type', 'application/json');
      c.header('x-powered-by', 'gemini-code-api');

      return c.json(claudeResponse, 200);
    } catch (error) {
      throw error;
    }
  });

  /**
   * OPTIONS /v1/messages
   * CORS预检请求处理
   */
  app.options('/', async () => {
    return new Response('', { status: 204 });
  });

  return app;
}