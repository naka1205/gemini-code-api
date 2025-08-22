/**
 * 基础适配器抽象类
 * 定义所有协议适配器的通用接口和基础功能
 */
import type { Context } from 'hono';
import type { ClientType } from '@/types';
import { getGlobalSelector } from '@/services/load-balancer/selector.js';
import { getGlobalMetricsCollector } from '@/services/load-balancer/metrics.js';
import { httpClient } from '@/services/http/client.js';
import { throwError } from '@/middleware/error-handler.js';
import { logApiMetrics } from '@/middleware/logger.js';
import { API_CONFIG } from '@/utils/constants.js';

/**
 * 适配器请求上下文
 */
export interface AdapterContext {
  request: Request;
  context: Context;
  clientType: ClientType;
  apiKeys: string[];
  selectedKey?: string;
  selectedKeyHash?: string;
  requestId: string;
}

/**
 * 适配器响应结果
 */
export interface AdapterResult<T = any> {
  data: T;
  statusCode: number;
  headers?: Record<string, string>;
  metrics?: {
    responseTime: number;
    tokenUsage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
  };
}

/**
 * 流式响应结果
 */
export interface StreamingAdapterResult {
  stream: ReadableStream;
  statusCode: number;
  headers?: Record<string, string>;
}

/**
 * 基础适配器抽象类
 */
export abstract class BaseAdapter {
  protected clientType: ClientType;
  protected selector = getGlobalSelector();
  protected metricsCollector = getGlobalMetricsCollector();

  constructor(clientType: ClientType) {
    this.clientType = clientType;
  }

  /**
   * 处理请求的主要方法
   */
  async processRequest(context: AdapterContext): Promise<AdapterResult> {
    const startTime = Date.now();

    try {
      // 1. 验证请求
      await this.validateRequest(context);

      // 2. 选择最优API KEY
      const keySelection = await this.selectApiKey(context);
      context.selectedKey = keySelection.selectedKey;
      context.selectedKeyHash = keySelection.selectedKeyHash;

      // 3. 转换请求格式
      const transformedRequest = await this.transformRequest(context);

      // 4. 调用Gemini API
      const response = await this.callGeminiApi(transformedRequest, context);

      // 5. 转换响应格式
      const transformedResponse = await this.transformResponse(response, context);

      // 6. 记录成功指标
      const responseTime = Date.now() - startTime;
      this.recordMetrics(context, responseTime, true);

      return {
        ...transformedResponse,
        metrics: {
          responseTime,
          tokenUsage: transformedResponse.data?.usage,
        },
      };
    } catch (error) {
      // 记录失败指标
      const responseTime = Date.now() - startTime;
      this.recordMetrics(context, responseTime, false);
      throw error;
    }
  }

  /**
   * 处理流式请求
   */
  async processStreamingRequest(context: AdapterContext): Promise<StreamingAdapterResult> {
    const startTime = Date.now();

    try {
      // 1. 验证请求
      await this.validateRequest(context);

      // 2. 选择最优API KEY
      const keySelection = await this.selectApiKey(context);
      context.selectedKey = keySelection.selectedKey;
      context.selectedKeyHash = keySelection.selectedKeyHash;

      // 3. 转换请求格式
      const transformedRequest = await this.transformRequest(context);

      // 4. 创建流式响应
      const streamResult = await this.createStreamingResponse(transformedRequest, context);

      // 记录流式请求开始
      this.recordMetrics(context, Date.now() - startTime, true);

      return streamResult;
    } catch (error) {
      // 记录失败指标
      this.recordMetrics(context, Date.now() - startTime, false);
      throw error;
    }
  }

  // === 抽象方法（子类必须实现） ===

  /**
   * 验证请求格式和参数
   */
  protected abstract validateRequest(context: AdapterContext): Promise<void>;

  /**
   * 将客户端请求转换为Gemini API格式
   */
  protected abstract transformRequest(context: AdapterContext): Promise<any>;

  /**
   * 将Gemini API响应转换为客户端格式
   */
  protected abstract transformResponse(response: any, context: AdapterContext): Promise<AdapterResult>;

  /**
   * 创建流式响应
   */
  protected abstract createStreamingResponse(
    transformedRequest: any,
    context: AdapterContext
  ): Promise<StreamingAdapterResult>;

  // === 通用方法 ===

  /**
   * 选择最优API KEY
   */
  protected async selectApiKey(context: AdapterContext) {
    if (!context.apiKeys || context.apiKeys.length === 0) {
      throwError.authentication('No API keys provided');
    }

    const selection = this.selector.selectApiKey(context.apiKeys);
    
    // 更新上下文
    context.context.set('selectedKey', selection.selectedKey);
    context.context.set('selectedKeyHash', selection.selectedKeyHash);
    context.context.set('availableKeys', selection.availableKeys);
    context.context.set('healthyKeys', selection.healthyKeys);

    return selection;
  }

  /**
   * 调用Gemini API
   */
  protected async callGeminiApi(request: any, context: AdapterContext): Promise<any> {
    if (!context.selectedKey) {
      throwError.internal('No API key selected');
    }

    const url = this.buildGeminiApiUrl(request, context);
    const headers = this.buildGeminiHeaders(context.selectedKey!, context);

    try {
      const response = await httpClient.request(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.data.catch(() => ({}));
        throwError.api(
          errorData.error?.message || `Gemini API error: ${response.status}`,
          response.status,
          { geminiError: errorData }
        );
      }

      return await response.data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throwError.network('Request timeout');
      }
      throw error;
    }
  }

  /**
   * 构建Gemini API URL
   */
  protected buildGeminiApiUrl(_request: any, _context: AdapterContext): string {
    // 子类可以重写此方法来构建特定的URL
    return `${API_CONFIG.GEMINI_BASE_URL}/${API_CONFIG.GEMINI_API_VERSION}/models/gemini-pro:generateContent`;
  }

  /**
   * 构建Gemini API请求头
   */
  protected buildGeminiHeaders(apiKey: string, _context: AdapterContext): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
      'User-Agent': 'gemini-code-api/2.0.0',
    };
  }

  /**
   * 记录指标
   */
  protected recordMetrics(
    context: AdapterContext,
    responseTime: number,
    success: boolean,
    tokenUsage?: any
  ): void {
    if (context.selectedKey) {
      this.metricsCollector.recordRequest(
        context.selectedKey,
        responseTime,
        success
      );
    }

    // 记录到日志
    logApiMetrics(
      context.context,
      context.selectedKeyHash || 'unknown',
      this.extractModelFromContext(context),
      responseTime,
      success,
      tokenUsage
    );
  }

  /**
   * 从上下文提取模型信息
   */
  protected extractModelFromContext(_context: AdapterContext): string {
    // 子类可以重写此方法来提取具体的模型信息
    return 'gemini-pro';
  }

  /**
   * 获取客户端类型
   */
  getClientType(): ClientType {
    return this.clientType;
  }

  /**
   * 检查是否支持流式响应
   */
  supportsStreaming(): boolean {
    return true; // 默认支持，子类可以重写
  }

  /**
   * 检查是否支持特定功能
   */
  supportsFeature(feature: string): boolean {
    // 子类可以重写来声明支持的功能
    const supportedFeatures = ['chat', 'completion'];
    return supportedFeatures.includes(feature);
  }
}

/**
 * 适配器工厂接口
 */
export interface AdapterFactory {
  createAdapter(clientType: ClientType): BaseAdapter;
  getSupportedClientTypes(): ClientType[];
}

/**
 * 适配器注册表
 */
export class AdapterRegistry {
  private adapters = new Map<ClientType, () => BaseAdapter>();

  /**
   * 注册适配器
   */
  register(clientType: ClientType, factory: () => BaseAdapter): void {
    this.adapters.set(clientType, factory);
  }

  /**
   * 获取适配器
   */
  getAdapter(clientType: ClientType): BaseAdapter | null {
    const factory = this.adapters.get(clientType);
    return factory ? factory() : null;
  }

  /**
   * 检查是否支持客户端类型
   */
  isSupported(clientType: ClientType): boolean {
    return this.adapters.has(clientType);
  }

  /**
   * 获取所有支持的客户端类型
   */
  getSupportedClientTypes(): ClientType[] {
    return Array.from(this.adapters.keys());
  }
}

/**
 * 全局适配器注册表
 */
export const globalAdapterRegistry = new AdapterRegistry();