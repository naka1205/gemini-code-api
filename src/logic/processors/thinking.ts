// src/logic/processors/thinking.ts

/**
 * 思考配置处理器 - 专门处理思考功能相关的配置转换
 * 支持Claude Extended Thinking到Gemini 2.5 thinkingConfig的转换
 */

import { 
  IProcessor, 
  ProcessContext, 
  ValidationResult,
  ClaudeThinkingConfig,
  GeminiThinkingConfig 
} from './types';

export class ThinkingProcessor implements IProcessor<ClaudeThinkingConfig, GeminiThinkingConfig> {
  /**
   * 实现IProcessor接口的process方法
   */
  process(input: ClaudeThinkingConfig, context?: ProcessContext): GeminiThinkingConfig {
    const { model, features, maxTokens } = context || {};
    
    if (!features?.thinking || !this.isThinkingSupported(model || '')) {
      return { includeThoughts: false };
    }
    
    return this.convertThinkingConfig(input, maxTokens, true);
  }

  /**
   * 实现IProcessor接口的validate方法
   */
  validate(input: ClaudeThinkingConfig): ValidationResult {
    const errors: string[] = [];
    
    if (!input) {
      return { isValid: true, errors: [] }; // 允许未定义
    }

    if (typeof input !== 'object') {
      errors.push('thinking must be an object');
    }

    if (input.type && !['enabled', 'disabled'].includes(input.type)) {
      errors.push('thinking.type must be "enabled" or "disabled"');
    }

    if (input.budget_tokens !== undefined) {
      if (typeof input.budget_tokens !== 'number' || input.budget_tokens < 1) {
        errors.push('thinking.budget_tokens must be a positive number');
      }
      if (input.budget_tokens > 8192) {
        errors.push('thinking.budget_tokens cannot exceed 8192');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 检查模型是否支持思考功能
   * gemini-2.0-flash 不支持推理，只有 2.5 系列支持
   */
  private isThinkingSupported(model: string): boolean {
    // gemini-2.0-flash 不支持推理
    if (model === 'gemini-2.0-flash') {
      return false;
    }
    // gemini-2.5-flash 和 gemini-2.5-pro 支持推理
    return model.includes('2.5');
  }

  /**
   * 转换Claude思考配置到Gemini格式（静态方法）
   */
  static convertThinkingConfig(thinking?: ClaudeThinkingConfig, maxTokens?: number, supportsThinking: boolean = false): GeminiThinkingConfig {
    const processor = new ThinkingProcessor();
    return processor.process(thinking || { type: 'disabled' }, {
      model: '',
      features: { thinking: supportsThinking, tools: false, multimodal: false, streaming: false },
      options: {},
      maxTokens: maxTokens || 1024
    });
  }

  /**
   * 转换Claude思考配置到Gemini格式（私有方法）
   */
  private convertThinkingConfig(thinking?: ClaudeThinkingConfig, maxTokens?: number, supportsThinking: boolean = false): GeminiThinkingConfig {
    if (!supportsThinking) {
      return { includeThoughts: false };
    }

    if (thinking && thinking.type === 'disabled') {
      // 明确禁用thinking以避免Gemini为thinking预留token
      return { includeThoughts: false, thinkingBudget: 0 };
    }

    if (thinking && thinking.type === 'enabled') {
      const thinkingBudget = this.calculateThinkingBudget(thinking.budget_tokens, maxTokens);
      return {
        includeThoughts: true,
        thinkingBudget
      };
    }

    // 当没有明确指定thinking配置时，对于支持thinking的模型默认禁用
    // 这与Claude的默认行为一致
    return { includeThoughts: false };
  }

  /**
   * 静态方法：验证思考配置（向后兼容）
   */
  static validateThinkingConfig(thinking: any): void {
    const processor = new ThinkingProcessor();
    const result = processor.validate(thinking);
    if (!result.isValid) {
      throw new Error(result.errors.join(', '));
    }
  }

  /**
   * 计算思考预算
   */
  private calculateThinkingBudget(userBudget?: number, maxTokens?: number, defaultMaxTokens: number = 4096): number {
    const maxTokensValue = maxTokens || defaultMaxTokens;
    
    if (userBudget) {
      // 用户指定了预算，确保在合理范围内
      return Math.max(256, Math.min(userBudget, Math.floor(maxTokensValue * 0.5)));
    }
    
    // 默认预算：最大token数的25%，但不低于256
    return Math.max(256, Math.floor(maxTokensValue * 0.25));
  }

  /**
   * 静态方法：计算思考预算（向后兼容）
   */
  static calculateThinkingBudget(userBudget?: number, maxTokens?: number, defaultMaxTokens: number = 4096): number {
    const processor = new ThinkingProcessor();
    return processor.calculateThinkingBudget(userBudget, maxTokens, defaultMaxTokens);
  }

  /**
   * 静态方法：检查思考配置是否有效（向后兼容）
   */
  static isValidThinkingConfig(thinking: any): boolean {
    try {
      ThinkingProcessor.validateThinkingConfig(thinking);
      return true;
    } catch {
      return false;
    }
  }
}
