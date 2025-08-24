/**
 * V1 模型路由
 * OpenAI /v1/models API兼容端点
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { getLogger } from '../../middleware/logger.js';
import { MODEL_MAPPINGS } from '../../utils/constants.js';

/**
 * 创建模型路由
 */
export function createModelsRoute(): Hono {
  const app = new Hono();

  /**
   * GET /v1/models
   * 返回支持的模型列表 (OpenAI格式)
   */
  app.get('/', async (c: Context) => {
    const logger = getLogger(c);

    try {
      logger.info('Models list request');

      // 返回映射的OpenAI模型列表
      const models = Object.keys(MODEL_MAPPINGS).map(model => ({
        id: model,
        object: 'model',
        created: 1677610602,
        owned_by: 'gemini-code-api',
        permission: [{
          id: 'modelperm-' + model.replace(/[^a-zA-Z0-9]/g, ''),
          object: 'model_permission',
          created: 1677610602,
          allow_create_engine: false,
          allow_sampling: true,
          allow_logprobs: false,
          allow_search_indices: false,
          allow_view: true,
          allow_fine_tuning: false,
          organization: '*',
          group: null,
          is_blocking: false
        }]
      }));

      const response = {
        object: 'list',
        data: models
      };

      logger.info(`Returned ${models.length} models`);
      
      c.header('Content-Type', 'application/json');
      c.header('x-powered-by', 'gemini-code-api');

      return c.json(response, 200);
    } catch (error) {
      throw error;
    }
  });

  /**
   * GET /v1/models/:model
   * 返回特定模型信息
   */
  app.get('/:model', async (c: Context) => {
    const logger = getLogger(c);
    const modelId = c.req.param('model');

    try {
      logger.info('Single model info request', { model: modelId });

      // 检查模型是否在映射中
      if (!(modelId in MODEL_MAPPINGS)) {
        return c.json({
          error: {
            message: `Model ${modelId} not found`,
            type: 'invalid_request_error',
            param: 'model',
            code: 'model_not_found'
          }
        }, 404);
      }

      const modelInfo = {
        id: modelId,
        object: 'model',
        created: 1677610602,
        owned_by: 'gemini-code-api',
        permission: [{
          id: 'modelperm-' + modelId.replace(/[^a-zA-Z0-9]/g, ''),
          object: 'model_permission',
          created: 1677610602,
          allow_create_engine: false,
          allow_sampling: true,
          allow_logprobs: false,
          allow_search_indices: false,
          allow_view: true,
          allow_fine_tuning: false,
          organization: '*',
          group: null,
          is_blocking: false
        }]
      };

      logger.info(`Returned model info for ${modelId}`);
      
      c.header('Content-Type', 'application/json');
      c.header('x-powered-by', 'gemini-code-api');

      return c.json(modelInfo, 200);
    } catch (error) {
      throw error;
    }
  });

  /**
   * OPTIONS处理
   */
  app.options('/', async () => {
    return new Response('', { status: 204 });
  });

  app.options('/:model', async () => {
    return new Response('', { status: 204 });
  });

  return app;
}