/**
 * V1 嵌入路由
 * OpenAI /v1/embeddings API兼容端点
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { detectClientType } from '@/middleware/auth/detector.js';
import { extractAndValidateApiKeys } from '@/middleware/auth/extractor.js';
import { throwError } from '@/middleware/error-handler.js';
import { getLogger } from '@/middleware/logger.js';
import { MODEL_MAPPINGS } from '@/utils/constants.js';

/**
 * 创建嵌入路由
 */
export function createEmbeddingsRoute(): Hono {
  const app = new Hono();

  /**
   * POST /v1/embeddings
   * OpenAI嵌入API兼容端点
   */
  app.post('/', async (c: Context) => {
    const logger = getLogger(c);

    try {
      logger.info('OpenAI embeddings request');

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
        hasInput: !!requestBody.input 
      });

      // 验证必需字段
      if (!requestBody.model || !requestBody.input) {
        throwError.validation('Fields "model" and "input" are required');
      }

      // 映射OpenAI嵌入模型到Gemini模型
      const geminiModel = MODEL_MAPPINGS[requestBody.model as keyof typeof MODEL_MAPPINGS] || 'text-embedding-004';
      logger.info('Model mapping', { openaiModel: requestBody.model, geminiModel });

      // 处理输入文本（可能是字符串或字符串数组）
      const inputTexts = Array.isArray(requestBody.input) ? requestBody.input : [requestBody.input];
      
      // 准备结果数组
      const embeddings = [];
      
      // 选择API密钥
      const selectedKey = authResult.validation.validKeys[0];

      // 为每个输入文本生成嵌入
      for (let i = 0; i < inputTexts.length; i++) {
        const inputText = inputTexts[i];
        
        // 构建Gemini嵌入请求
        const geminiRequest = {
          content: {
            parts: [{ text: inputText }]
          }
        };

        // 构建Gemini API URL
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:embedContent?key=${selectedKey}`;
        
        logger.info('Calling Gemini embedContent API', { model: geminiModel, inputIndex: i });

        // 调用Gemini嵌入API
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
          logger.error(`Gemini embedContent API error: ${response.status}`, new Error(`API Error: ${responseData.error?.message || 'Unknown error'}`));
          throwError.api(
            responseData.error?.message || `Gemini API error: ${response.status}`,
            response.status
          );
        }

        // 添加到结果数组
        embeddings.push({
          object: 'embedding',
          embedding: responseData.embedding?.values || [],
          index: i
        });
      }

      logger.info(`Generated ${embeddings.length} embeddings`);

      // 构建OpenAI格式响应
      const openaiResponse = {
        object: 'list',
        data: embeddings,
        model: requestBody.model,
        usage: {
          prompt_tokens: inputTexts.reduce((sum: number, text: string) => sum + Math.ceil(text.length / 4), 0), // 估算token数量
          total_tokens: inputTexts.reduce((sum: number, text: string) => sum + Math.ceil(text.length / 4), 0)
        }
      };

      // 设置响应头
      c.header('Content-Type', 'application/json');
      c.header('x-powered-by', 'gemini-code-api');

      return c.json(openaiResponse, 200);
    } catch (error) {
      throw error;
    }
  });

  /**
   * OPTIONS /v1/embeddings
   * CORS预检请求处理
   */
  app.options('/', async () => {
    return new Response('', { status: 204 });
  });

  return app;
}