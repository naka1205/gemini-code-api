/**
 * OpenAI模型兼容性映射
 * 提供OpenAI模型到Gemini模型的映射关系
 */
import { MODEL_MAPPINGS } from '../../utils/constants.js';

/**
 * OpenAI模型信息（兼容格式）
 */
export interface OpenAIModelInfo {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
  permission: Array<{
    id: string;
    object: 'model_permission';
    created: number;
    allow_create_engine: boolean;
    allow_sampling: boolean;
    allow_logprobs: boolean;
    allow_search_indices: boolean;
    allow_view: boolean;
    allow_fine_tuning: boolean;
    organization: string;
    group: null;
    is_blocking: boolean;
  }>;
  root: string;
  parent: null;
}

/**
 * OpenAI模型列表响应
 */
export interface OpenAIModelsResponse {
  object: 'list';
  data: OpenAIModelInfo[];
}

/**
 * OpenAI兼容模型管理器
 */
export class OpenAIModelManager {
  /**
   * 获取所有支持的OpenAI兼容模型
   */
  static getSupportedModels(): string[] {
    return Object.keys(MODEL_MAPPINGS);
  }

  /**
   * 检查OpenAI模型是否受支持
   */
  static isModelSupported(model: string): boolean {
    return model in MODEL_MAPPINGS;
  }

  /**
   * 将OpenAI模型映射为Gemini模型
   */
  static mapToGeminiModel(openaiModel: string): string | null {
    return MODEL_MAPPINGS[openaiModel as keyof typeof MODEL_MAPPINGS] || null;
  }

  /**
   * 获取OpenAI格式的模型列表
   */
  static getModelList(): OpenAIModelsResponse {
    const supportedModels = this.getSupportedModels();
    const timestamp = Math.floor(Date.now() / 1000);

    const models: OpenAIModelInfo[] = supportedModels.map(modelId => ({
      id: modelId,
      object: 'model',
      created: timestamp,
      owned_by: 'google-via-gemini-code-api',
      permission: [{
        id: `modelperm-${modelId}`,
        object: 'model_permission',
        created: timestamp,
        allow_create_engine: false,
        allow_sampling: true,
        allow_logprobs: false,
        allow_search_indices: false,
        allow_view: true,
        allow_fine_tuning: false,
        organization: '*',
        group: null,
        is_blocking: false,
      }],
      root: modelId,
      parent: null,
    }));

    return {
      object: 'list',
      data: models,
    };
  }

  /**
   * 获取特定模型的详细信息
   */
  static getModelInfo(modelId: string): OpenAIModelInfo | null {
    if (!this.isModelSupported(modelId)) {
      return null;
    }

    const timestamp = Math.floor(Date.now() / 1000);

    return {
      id: modelId,
      object: 'model',
      created: timestamp,
      owned_by: 'google-via-gemini-code-api',
      permission: [{
        id: `modelperm-${modelId}`,
        object: 'model_permission',
        created: timestamp,
        allow_create_engine: false,
        allow_sampling: true,
        allow_logprobs: false,
        allow_search_indices: false,
        allow_view: true,
        allow_fine_tuning: false,
        organization: '*',
        group: null,
        is_blocking: false,
      }],
      root: modelId,
      parent: null,
    };
  }

  /**
   * 根据用途筛选模型
   */
  static getModelsByCapability(capability: 'chat' | 'completion' | 'embedding' | 'vision'): string[] {
    const supportedModels = this.getSupportedModels();

    switch (capability) {
      case 'chat':
      case 'completion':
        return supportedModels.filter(model => 
          !model.includes('embedding') && !model.includes('vision')
        );
      
      case 'embedding':
        return supportedModels.filter(model => model.includes('embedding'));
      
      case 'vision':
        // GPT-4 系列模型通过Gemini 2.5支持视觉功能
        return supportedModels.filter(model => 
          model.startsWith('gpt-4') && !model.includes('embedding')
        );
      
      default:
        return supportedModels;
    }
  }

  /**
   * 获取模型的建议配置
   */
  static getModelDefaults(modelId: string): {
    temperature: number;
    max_tokens: number;
    top_p: number;
    frequency_penalty: number;
    presence_penalty: number;
  } {
    // 根据不同模型类型返回推荐配置
    if (modelId.includes('gpt-4')) {
      return {
        temperature: 0.7,
        max_tokens: 4096,
        top_p: 1.0,
        frequency_penalty: 0,
        presence_penalty: 0,
      };
    } else if (modelId.includes('gpt-3.5')) {
      return {
        temperature: 1.0,
        max_tokens: 4096,
        top_p: 1.0,
        frequency_penalty: 0,
        presence_penalty: 0,
      };
    } else {
      return {
        temperature: 0.9,
        max_tokens: 2048,
        top_p: 1.0,
        frequency_penalty: 0,
        presence_penalty: 0,
      };
    }
  }

  /**
   * 获取模型的限制信息
   */
  static getModelLimits(modelId: string): {
    max_tokens: number;
    context_length: number;
    supports_functions: boolean;
    supports_vision: boolean;
    supports_streaming: boolean;
  } {
    const geminiModel = this.mapToGeminiModel(modelId);
    
    if (modelId.includes('gpt-4')) {
      return {
        max_tokens: 4096,
        context_length: geminiModel?.includes('2.5') ? 2097152 : 32768,
        supports_functions: true,
        supports_vision: true,
        supports_streaming: true,
      };
    } else if (modelId.includes('gpt-3.5')) {
      return {
        max_tokens: 4096,
        context_length: geminiModel?.includes('2.5') ? 1048576 : 16384,
        supports_functions: true,
        supports_vision: false,
        supports_streaming: true,
      };
    } else if (modelId.includes('embedding')) {
      return {
        max_tokens: 8191, // 嵌入维度
        context_length: 8191,
        supports_functions: false,
        supports_vision: false,
        supports_streaming: false,
      };
    } else {
      return {
        max_tokens: 2048,
        context_length: 32768,
        supports_functions: false,
        supports_vision: false,
        supports_streaming: true,
      };
    }
  }

  /**
   * 验证模型参数是否合理
   */
  static validateModelParams(modelId: string, params: any): string[] {
    const errors: string[] = [];
    const limits = this.getModelLimits(modelId);

    if (params.max_tokens && params.max_tokens > limits.max_tokens) {
      errors.push(`max_tokens ${params.max_tokens} exceeds model limit ${limits.max_tokens}`);
    }

    if (params.functions && !limits.supports_functions) {
      errors.push(`Model ${modelId} does not support function calling`);
    }

    if (params.tools && !limits.supports_functions) {
      errors.push(`Model ${modelId} does not support tools`);
    }

    if (params.stream && !limits.supports_streaming) {
      errors.push(`Model ${modelId} does not support streaming`);
    }

    return errors;
  }

  /**
   * 获取相似模型建议
   */
  static getSimilarModels(modelId: string): string[] {
    if (modelId.includes('gpt-4')) {
      return this.getSupportedModels().filter(m => m.includes('gpt-4') && m !== modelId);
    } else if (modelId.includes('gpt-3.5')) {
      return this.getSupportedModels().filter(m => m.includes('gpt-3.5') && m !== modelId);
    } else if (modelId.includes('embedding')) {
      return this.getSupportedModels().filter(m => m.includes('embedding') && m !== modelId);
    }

    return [];
  }

  /**
   * 创建模型映射说明文档
   */
  static getModelMappingDocs(): Record<string, {
    openai_model: string;
    gemini_model: string;
    description: string;
    capabilities: string[];
  }> {
    const docs: Record<string, any> = {};
    
    Object.entries(MODEL_MAPPINGS).forEach(([openaiModel, geminiModel]) => {
      const limits = this.getModelLimits(openaiModel);
      
      docs[openaiModel] = {
        openai_model: openaiModel,
        gemini_model: geminiModel,
        description: this.getModelDescription(openaiModel),
        capabilities: this.getModelCapabilities(limits),
      };
    });

    return docs;
  }

  // === 私有辅助方法 ===

  private static getModelDescription(modelId: string): string {
    if (modelId.includes('gpt-4o')) {
      return 'Most capable OpenAI model, mapped to Gemini 2.5 Pro for best performance';
    } else if (modelId.includes('gpt-4')) {
      return 'High capability model suitable for complex tasks';
    } else if (modelId.includes('gpt-3.5')) {
      return 'Fast and efficient model for everyday tasks';
    } else if (modelId.includes('embedding')) {
      return 'Text embedding model for similarity and search tasks';
    }
    return 'Language model';
  }

  private static getModelCapabilities(limits: any): string[] {
    const capabilities: string[] = ['text-generation'];
    
    if (limits.supports_functions) capabilities.push('function-calling');
    if (limits.supports_vision) capabilities.push('vision');
    if (limits.supports_streaming) capabilities.push('streaming');
    
    return capabilities;
  }
}