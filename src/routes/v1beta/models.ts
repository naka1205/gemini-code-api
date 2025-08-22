/**
 * V1Beta Gemini模型路由
 * Gemini原生模型API端点
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { getAvailableModels, getModelByName } from '@/adapters/gemini/models.js';
import { detectClientType } from '@/middleware/auth/detector.js';
import { extractAndValidateApiKeys } from '@/middleware/auth/extractor.js';
import { throwError } from '@/middleware/error-handler.js';
import { getLogger } from '@/middleware/logger.js';
import { API_CONFIG } from '@/utils/constants.js';

/**
 * 创建Gemini模型路由
 */
export function createGeminiModelsRoute(): Hono {
  const app = new Hono();

  /**
   * GET /v1beta/models
   * 获取所有可用的Gemini模型
   */
  app.get('/', async (c: Context) => {
    const logger = getLogger(c);

    try {
      logger.info('Fetching Gemini models list');

      // 对于模型列表，我们可以直接返回本地缓存的模型信息
      // 或者可选择调用Gemini API获取最新模型列表
      const useGeminiAPI = c.req.query('live') === 'true';

      if (useGeminiAPI) {
        // 从Gemini API获取实时模型列表
        const models = await fetchLiveModelsFromGemini(c);
        return c.json(models);
      } else {
        // 返回本地缓存的模型列表
        const models = getAvailableModels();
        
        const response = {
          models: models.map(model => ({
            name: `models/${model.name}`,
            displayName: model.displayName,
            description: model.description,
            version: model.version,
            inputTokenLimit: model.inputTokenLimit,
            outputTokenLimit: model.outputTokenLimit,
            supportedGenerationMethods: model.supportedGenerationMethods,
            temperature: model.temperature,
            topP: model.topP,
            topK: model.topK,
          })),
        };

        logger.info(`Returned ${models.length} cached Gemini models`);
        return c.json(response);
      }
    } catch (error) {
      logger.error('Failed to fetch Gemini models list', error instanceof Error ? error : undefined);
      throw error;
    }
  });

  /**
   * GET /v1beta/models/:model
   * 获取特定Gemini模型信息
   */
  app.get('/:model', async (c: Context) => {
    const logger = getLogger(c);
    const modelName = c.req.param('model');

    try {
      logger.info(`Fetching Gemini model info for: ${modelName}`);

      // 从模型名中提取实际的模型ID（移除 'models/' 前缀）
      const actualModelName = modelName.startsWith('models/') ? modelName.substring(7) : modelName;

      const model = getModelByName(actualModelName);

      if (!model) {
        return c.json({
          error: {
            code: 404,
            message: `Model '${modelName}' not found`,
            status: 'NOT_FOUND',
          },
        }, 404);
      }

      const response = {
        name: `models/${model.name}`,
        displayName: model.displayName,
        description: model.description,
        version: model.version,
        inputTokenLimit: model.inputTokenLimit,
        outputTokenLimit: model.outputTokenLimit,
        supportedGenerationMethods: model.supportedGenerationMethods,
        temperature: model.temperature,
        topP: model.topP,
        topK: model.topK,
      };

      logger.info(`Returned Gemini model info for: ${modelName}`);
      return c.json(response);
    } catch (error) {
      logger.error(`Failed to fetch Gemini model info for: ${modelName}`, error instanceof Error ? error : undefined);
      throw error;
    }
  });

  /**
   * OPTIONS处理
   */
  app.options('/*', async () => {
    return new Response('', { status: 204 });
  });

  return app;
}

/**
 * 从Gemini API获取实时模型列表
 */
async function fetchLiveModelsFromGemini(c: Context): Promise<any> {
  const logger = getLogger(c);

  try {
    // 1. 检测客户端类型和提取API密钥
    const detectionResult = detectClientType(c.req.raw);
    const authResult = extractAndValidateApiKeys(c.req.raw, detectionResult);
    
    if (!authResult.hasValidKeys) {
      throwError.authentication('Valid Gemini API keys required to fetch live models');
    }

    // 2. 使用第一个可用的API密钥调用Gemini API
    const apiKey = authResult.validation.validKeys[0];
    const geminiUrl = `${API_CONFIG.GEMINI_BASE_URL}/${API_CONFIG.GEMINI_API_VERSION}/models?key=${apiKey}`;

    logger.info('Fetching live models from Gemini API');

    const response = await fetch(geminiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'gemini-code-api/2.0.0',
      },
      signal: AbortSignal.timeout(10000), // 10秒超时
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as any;
      throwError.api(
        errorData.error?.message || `Gemini API error: ${response.status}`,
        response.status
      );
    }

    const result = await response.json() as any;
    
    logger.info(`Fetched ${result.models?.length || 0} live models from Gemini API`);
    
    return result;
  } catch (error) {
    logger.error('Failed to fetch live models from Gemini API', error instanceof Error ? error : undefined);
    
    // 如果实时获取失败，回退到本地缓存
    logger.info('Falling back to cached models');
    
    const models = getAvailableModels();
    return {
      models: models.map(model => ({
        name: `models/${model.name}`,
        displayName: model.displayName,
        description: model.description,
        version: model.version,
        inputTokenLimit: model.inputTokenLimit,
        outputTokenLimit: model.outputTokenLimit,
        supportedGenerationMethods: model.supportedGenerationMethods,
      })),
    };
  }
}