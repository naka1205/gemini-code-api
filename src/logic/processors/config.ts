// src/logic/processors/config.ts

/**
 * 配置处理器 - 专门处理模型配置相关的数据结构转换
 * 遵循"只做数据结构转换，不处理对话内容"的原则
 */

export interface GenerationConfig {
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  thinkingConfig?: any;
}

export class ConfigProcessor {
  /**
   * 创建默认的生成配置
   * 只做配置转换，不处理内容
   */
  static createDefaultGenerationConfig(
    maxTokens?: number,
    temperature?: number,
    topP?: number,
    topK?: number
  ): GenerationConfig {
    return {
      maxOutputTokens: maxTokens || 4096,
      temperature: temperature || 0.7,
      topP: topP || 1.0,
      topK: topK || 40,
    };
  }

  /**
   * 合并用户配置和默认配置
   * 只做配置合并，不处理内容
   */
  static mergeGenerationConfig(
    userConfig: any,
    defaultConfig: GenerationConfig
  ): GenerationConfig {
    return {
      ...defaultConfig,
      // 只合并Gemini API支持的字段
      maxOutputTokens: this.ensureNumber(userConfig.max_tokens, defaultConfig.maxOutputTokens || 4096),
      temperature: this.ensureNumber(userConfig.temperature, defaultConfig.temperature || 0.7),
      topP: this.ensureNumber(userConfig.top_p, defaultConfig.topP || 1.0),
      topK: this.ensureNumber(userConfig.top_k, defaultConfig.topK || 40),
    };
  }

  /**
   * 验证数值参数
   * 只做验证，不修改内容
   */
  static validateNumericConfig(
    maxTokens?: number,
    temperature?: number,
    topP?: number,
    topK?: number
  ): void {
    if (maxTokens !== undefined && (typeof maxTokens !== 'number' || maxTokens < 1)) {
      throw new Error('Field "max_tokens" must be a positive number');
    }

    if (temperature !== undefined && (typeof temperature !== 'number' || temperature < 0 || temperature > 2)) {
      throw new Error('Field "temperature" must be a number between 0 and 2');
    }

    if (topP !== undefined && (typeof topP !== 'number' || topP < 0 || topP > 1)) {
      throw new Error('Field "top_p" must be a number between 0 and 1');
    }

    if (topK !== undefined && (typeof topK !== 'number' || topK < 1 || topK > 40)) {
      throw new Error('Field "top_k" must be a number between 1 and 40');
    }
  }

  /**
   * 确保数值类型正确
   * 只做类型转换，不修改内容
   */
  private static ensureNumber(value: any, defaultValue: number): number {
    if (value === undefined || value === null) {
      return defaultValue;
    }
    
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  }

  /**
   * 清理配置对象
   * 只做清理，不修改内容
   */
  static cleanConfig(config: any): any {
    if (!config || typeof config !== 'object') {
      return config;
    }

    const cleaned: any = {};
    for (const [key, value] of Object.entries(config)) {
      if (value !== undefined && value !== null) {
        cleaned[key] = value;
      }
    }

    return cleaned;
  }

  /**
   * 验证必需字段
   * 只做验证，不修改内容
   */
  static validateRequiredFields(data: any, requiredFields: string[]): void {
    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null) {
        throw new Error(`Field "${field}" is required`);
      }
    }
  }

  /**
   * 验证字段类型
   * 只做验证，不修改内容
   */
  static validateFieldType(data: any, field: string, expectedType: string): void {
    if (data[field] !== undefined && data[field] !== null) {
      const actualType = Array.isArray(data[field]) ? 'array' : typeof data[field];
      if (actualType !== expectedType) {
        throw new Error(`Field "${field}" must be of type "${expectedType}", got "${actualType}"`);
      }
    }
  }
}
