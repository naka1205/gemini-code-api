/**
 * Gemini模型列表
 * 提供可用的Gemini模型信息
 */

/**
 * Gemini模型信息
 */
export interface GeminiModel {
  name: string;
  displayName: string;
  description: string;
  version: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  supportedGenerationMethods: string[];
  temperature: number;
  topP: number;
  topK: number;
}

/**
 * 可用的Gemini模型列表
 */
export const GEMINI_MODELS: GeminiModel[] = [
  {
    name: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    description: 'Most capable model for complex reasoning tasks',
    version: '2.5',
    inputTokenLimit: 2097152, // 2M tokens
    outputTokenLimit: 8192,
    supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
    temperature: 1.0,
    topP: 0.95,
    topK: 40,
  },
  {
    name: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    description: 'Fast and efficient model for everyday tasks',
    version: '2.5',
    inputTokenLimit: 1048576, // 1M tokens
    outputTokenLimit: 8192,
    supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
    temperature: 1.0,
    topP: 0.95,
    topK: 40,
  },
  {
    name: 'gemini-pro',
    displayName: 'Gemini Pro',
    description: 'Previous generation capable model',
    version: '1.0',
    inputTokenLimit: 32768,
    outputTokenLimit: 2048,
    supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
    temperature: 0.9,
    topP: 1.0,
    topK: 32,
  },
  {
    name: 'gemini-pro-vision',
    displayName: 'Gemini Pro Vision',
    description: 'Multimodal model that can process images and text',
    version: '1.0',
    inputTokenLimit: 16384,
    outputTokenLimit: 2048,
    supportedGenerationMethods: ['generateContent'],
    temperature: 0.4,
    topP: 1.0,
    topK: 32,
  },
  {
    name: 'text-embedding-004',
    displayName: 'Text Embedding 004',
    description: 'Latest text embedding model',
    version: '004',
    inputTokenLimit: 2048,
    outputTokenLimit: 768, // 嵌入维度
    supportedGenerationMethods: ['embedContent'],
    temperature: 0.0,
    topP: 0.0,
    topK: 0,
  },
  {
    name: 'text-multilingual-embedding-002',
    displayName: 'Multilingual Text Embedding 002',
    description: 'Multilingual text embedding model',
    version: '002',
    inputTokenLimit: 2048,
    outputTokenLimit: 768,
    supportedGenerationMethods: ['embedContent'],
    temperature: 0.0,
    topP: 0.0,
    topK: 0,
  },
];

/**
 * 获取所有可用模型
 */
export function getAvailableModels(): GeminiModel[] {
  return [...GEMINI_MODELS];
}

/**
 * 根据名称获取模型信息
 */
export function getModelByName(name: string): GeminiModel | null {
  return GEMINI_MODELS.find(model => model.name === name) || null;
}

/**
 * 检查模型是否存在
 */
export function isValidModel(name: string): boolean {
  return GEMINI_MODELS.some(model => model.name === name);
}

/**
 * 获取默认模型
 */
export function getDefaultModel(): GeminiModel {
  return GEMINI_MODELS.find(model => model.name === 'gemini-2.5-pro') || GEMINI_MODELS[0];
}

/**
 * 根据功能筛选模型
 */
export function getModelsByFeature(feature: string): GeminiModel[] {
  switch (feature) {
    case 'chat':
    case 'completion':
      return GEMINI_MODELS.filter(model => 
        model.supportedGenerationMethods.includes('generateContent')
      );
    
    case 'streaming':
      return GEMINI_MODELS.filter(model =>
        model.supportedGenerationMethods.includes('streamGenerateContent')
      );
    
    case 'vision':
    case 'multimodal':
      return GEMINI_MODELS.filter(model =>
        model.name.includes('vision') || model.name.includes('2.5')
      );
    
    case 'embedding':
      return GEMINI_MODELS.filter(model =>
        model.supportedGenerationMethods.includes('embedContent')
      );
    
    default:
      return GEMINI_MODELS;
  }
}

/**
 * 获取模型的OpenAI格式信息（用于兼容性）
 */
export function getModelInOpenAIFormat(model: GeminiModel) {
  return {
    id: model.name,
    object: 'model',
    created: Date.now(),
    owned_by: 'google',
    permission: [{
      id: `modelperm-${model.name}`,
      object: 'model_permission',
      created: Date.now(),
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
    root: model.name,
    parent: null,
  };
}

/**
 * 获取所有模型的OpenAI兼容格式
 */
export function getAllModelsInOpenAIFormat() {
  return {
    object: 'list',
    data: GEMINI_MODELS.map(model => getModelInOpenAIFormat(model)),
  };
}

/**
 * 获取模型的Claude格式信息
 */
export function getModelInClaudeFormat(model: GeminiModel) {
  return {
    id: model.name,
    display_name: model.displayName,
    created_at: new Date().toISOString(),
    type: 'text',
  };
}

/**
 * 获取所有模型的Claude兼容格式
 */
export function getAllModelsInClaudeFormat() {
  return GEMINI_MODELS
    .filter(model => !model.name.includes('embedding'))
    .map(model => getModelInClaudeFormat(model));
}

/**
 * 模型能力检查
 */
export class ModelCapabilityChecker {
  /**
   * 检查模型是否支持流式输出
   */
  static supportsStreaming(modelName: string): boolean {
    const model = getModelByName(modelName);
    return model?.supportedGenerationMethods.includes('streamGenerateContent') || false;
  }

  /**
   * 检查模型是否支持视觉输入
   */
  static supportsVision(modelName: string): boolean {
    return modelName.includes('vision') || modelName.includes('2.5');
  }

  /**
   * 检查模型是否为嵌入模型
   */
  static isEmbeddingModel(modelName: string): boolean {
    return modelName.includes('embedding');
  }

  /**
   * 获取模型的最大输入token数
   */
  static getMaxInputTokens(modelName: string): number {
    const model = getModelByName(modelName);
    return model?.inputTokenLimit || 32768;
  }

  /**
   * 获取模型的最大输出token数
   */
  static getMaxOutputTokens(modelName: string): number {
    const model = getModelByName(modelName);
    return model?.outputTokenLimit || 2048;
  }

  /**
   * 验证生成参数是否适合模型
   */
  static validateGenerationConfig(modelName: string, config: any): string[] {
    const model = getModelByName(modelName);
    if (!model) {
      return [`Unknown model: ${modelName}`];
    }

    const errors: string[] = [];

    if (config.maxOutputTokens && config.maxOutputTokens > model.outputTokenLimit) {
      errors.push(`maxOutputTokens ${config.maxOutputTokens} exceeds model limit ${model.outputTokenLimit}`);
    }

    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
      errors.push('temperature must be between 0 and 2');
    }

    if (config.topP !== undefined && (config.topP < 0 || config.topP > 1)) {
      errors.push('topP must be between 0 and 1');
    }

    if (config.topK !== undefined && (config.topK < 1 || config.topK > 40)) {
      errors.push('topK must be between 1 and 40');
    }

    return errors;
  }
}