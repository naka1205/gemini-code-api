/**
 * OpenAI嵌入适配器
 * 处理OpenAI /v1/embeddings API兼容性
 */
import { BaseAdapter, type AdapterContext, type AdapterResult, type StreamingAdapterResult } from '../base/adapter.js';
import { RequestBodyValidator } from '../base/validator.js';
import { AdapterErrorHandler } from '../base/errors.js';
import { API_CONFIG } from '../../utils/constants.js';

/**
 * OpenAI嵌入请求格式
 */
export interface OpenAIEmbeddingRequest {
  input: string | string[];
  model: string;
  encoding_format?: 'float' | 'base64';
  dimensions?: number;
  user?: string;
}

/**
 * OpenAI嵌入响应格式
 */
export interface OpenAIEmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI嵌入适配器
 */
export class OpenAIEmbeddingAdapter extends BaseAdapter {
  constructor() {
    super('openai');
  }

  /**
   * 验证嵌入请求
   */
  protected async validateRequest(context: AdapterContext): Promise<void> {
    const body = await RequestBodyValidator.validateCommonRequestBody(context.request) as OpenAIEmbeddingRequest;

    // 验证必填字段
    RequestBodyValidator.validateRequired(body.input, 'input');
    RequestBodyValidator.validateRequired(body.model, 'model');

    // 验证输入格式
    if (typeof body.input === 'string') {
      RequestBodyValidator.validateStringLength(body.input, 'input', 1, 8000);
    } else if (Array.isArray(body.input)) {
      RequestBodyValidator.validateArrayLength(body.input, 'input', 1, 2048);
      body.input.forEach((text, index) => {
        RequestBodyValidator.validateRequired(text, `input[${index}]`);
        RequestBodyValidator.validateStringLength(text, `input[${index}]`, 1, 8000);
      });
    } else {
      throw new Error('Input must be a string or array of strings');
    }

    // 验证模型是否支持嵌入
    const mappedModel = this.mapEmbeddingModel(body.model);
    if (!mappedModel) {
      AdapterErrorHandler.handleModelMappingError(body.model, 'openai');
    }

    // 验证编码格式
    if (body.encoding_format && !['float', 'base64'].includes(body.encoding_format)) {
      RequestBodyValidator.validateEnum(body.encoding_format, 'encoding_format', ['float', 'base64']);
    }

    // 验证维度参数
    if (body.dimensions !== undefined) {
      RequestBodyValidator.validateNumberRange(body.dimensions, 'dimensions', 1, 3072);
    }

    // 将验证后的请求体存储到上下文
    context.context.set('requestBody', body);
    context.context.set('geminiModel', mappedModel);
  }

  /**
   * 转换嵌入请求为Gemini格式
   */
  protected async transformRequest(context: AdapterContext): Promise<any> {
    const openaiRequest = context.context.get('requestBody') as OpenAIEmbeddingRequest;
    
    try {
      // 将输入标准化为数组
      const inputs = Array.isArray(openaiRequest.input) 
        ? openaiRequest.input 
        : [openaiRequest.input];

      // Gemini嵌入API格式
      return {
        requests: inputs.map((text, index) => ({
          model: `models/${context.context.get('geminiModel')}`,
          content: {
            parts: [{ text }]
          },
          taskType: 'RETRIEVAL_DOCUMENT', // 默认任务类型
          title: `Document ${index + 1}`, // 可选标题
        }))
      };
    } catch (error) {
      AdapterErrorHandler.handleTransformError(error as Error, 'openai-embedding-to-gemini');
    }
  }

  /**
   * 转换Gemini嵌入响应为OpenAI格式
   */
  protected async transformResponse(response: any, context: AdapterContext): Promise<AdapterResult> {
    const openaiRequest = context.context.get('requestBody') as OpenAIEmbeddingRequest;
    
    try {
      // 验证响应结构
      if (!response.embeddings || !Array.isArray(response.embeddings)) {
        AdapterErrorHandler.validateResponse(response, ['embeddings']);
      }

      // 转换为OpenAI格式
      const openaiResponse: OpenAIEmbeddingResponse = {
        object: 'list',
        data: response.embeddings.map((embedding: any, index: number) => ({
          object: 'embedding',
          embedding: this.processEmbedding(embedding.values, openaiRequest.encoding_format, openaiRequest.dimensions),
          index,
        })),
        model: openaiRequest.model,
        usage: this.calculateUsage(openaiRequest.input, response),
      };

      // 存储token使用信息用于指标记录
      context.context.set('tokenUsage', openaiResponse.usage);

      return {
        data: openaiResponse,
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      };
    } catch (error) {
      AdapterErrorHandler.handleTransformError(error as Error, 'gemini-embedding-to-openai');
    }
  }

  /**
   * 嵌入不支持流式响应
   */
  protected async createStreamingResponse(
    _transformedRequest: any,
    _context: AdapterContext
  ): Promise<StreamingAdapterResult> {
    throw new Error('Streaming is not supported for embeddings');
  }

  /**
   * 构建Gemini嵌入API URL
   */
  protected buildGeminiApiUrl(_request: any, _context: AdapterContext): string {
    return `${API_CONFIG.GEMINI_BASE_URL}/${API_CONFIG.GEMINI_API_VERSION}:batchEmbedContents`;
  }

  /**
   * 从上下文提取模型信息
   */
  protected extractModelFromContext(context: AdapterContext): string {
    const openaiRequest = context.context.get('requestBody') as OpenAIEmbeddingRequest;
    return openaiRequest?.model || 'text-embedding-ada-002';
  }

  /**
   * 检查是否支持流式响应
   */
  supportsStreaming(): boolean {
    return false; // 嵌入不支持流式响应
  }

  /**
   * 获取支持的功能
   */
  supportsFeature(feature: string): boolean {
    const supportedFeatures = ['embedding', 'batch-embedding'];
    return supportedFeatures.includes(feature);
  }

  // === 私有辅助方法 ===

  /**
   * 映射嵌入模型名称
   */
  private mapEmbeddingModel(openaiModel: string): string | null {
    const embeddingModels: Record<string, string> = {
      'text-embedding-ada-002': 'text-embedding-004',
      'text-embedding-3-small': 'text-embedding-004',
      'text-embedding-3-large': 'text-multilingual-embedding-002',
      'text-similarity-ada-001': 'text-embedding-004',
      'text-similarity-babbage-001': 'text-embedding-004',
      'text-similarity-curie-001': 'text-embedding-004',
      'text-similarity-davinci-001': 'text-multilingual-embedding-002',
    };

    return embeddingModels[openaiModel] || null;
  }

  /**
   * 处理嵌入向量
   */
  private processEmbedding(
    values: number[],
    encodingFormat?: string,
    dimensions?: number
  ): number[] | string {
    let processedValues = values;

    // 如果指定了维度，进行截断或填充
    if (dimensions && dimensions !== values.length) {
      if (dimensions < values.length) {
        processedValues = values.slice(0, dimensions);
      } else {
        // 填充零值
        processedValues = [...values, ...new Array(dimensions - values.length).fill(0)];
      }
    }

    // 根据编码格式处理
    if (encodingFormat === 'base64') {
      // 转换为base64编码
      const buffer = new Float32Array(processedValues);
      const bytes = new Uint8Array(buffer.buffer);
      return btoa(String.fromCharCode(...bytes));
    }

    return processedValues;
  }

  /**
   * 计算token使用量
   */
  private calculateUsage(input: string | string[], _response: any): { prompt_tokens: number; total_tokens: number } {
    // 估算prompt tokens
    const texts = Array.isArray(input) ? input : [input];
    const promptTokens = texts.reduce((total, text) => {
      // 简单估算：每4个字符约等于1个token
      return total + Math.ceil(text.length / 4);
    }, 0);

    return {
      prompt_tokens: promptTokens,
      total_tokens: promptTokens, // 嵌入请求没有completion tokens
    };
  }
}