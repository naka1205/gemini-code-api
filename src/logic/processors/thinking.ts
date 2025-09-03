// src/logic/processors/thinking.ts

/**
 * 思考配置处理器 - 专门处理思考功能相关的配置转换
 * 遵循"只做数据结构转换，不处理对话内容"的原则
 */

export interface ThinkingConfig {
  type: 'enabled' | 'disabled';
  budget_tokens?: number;
}

export interface GeminiThinkingConfig {
  includeThoughts: boolean;
  thinkingBudget?: number;
}

export class ThinkingProcessor {
  /**
   * 检查模型是否支持思考功能
   * gemini-2.0-flash 不支持推理，只有 2.5 系列支持
   */
  static isThinkingSupported(model: string): boolean {
    // gemini-2.0-flash 不支持推理
    if (model === 'gemini-2.0-flash') {
      return false;
    }
    // gemini-2.5-flash 和 gemini-2.5-pro 支持推理
    return model.includes('2.5');
  }

  /**
   * 转换Claude思考配置到Gemini格式
   */
  static convertThinkingConfig(thinking?: ThinkingConfig, maxTokens?: number, supportsThinking: boolean = false): GeminiThinkingConfig | undefined {
    if (!supportsThinking) {
      return undefined;
    }

    if (thinking && thinking.type === 'disabled') {
      // 原版逻辑：明确禁用thinking以避免Gemini为thinking预留token
      return { includeThoughts: false };
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
   * 验证思考配置
   */
  static validateThinkingConfig(thinking: any): void {
    if (!thinking) return;

    if (typeof thinking !== 'object') {
      throw new Error('thinking must be an object');
    }

    if (thinking.type && !['enabled', 'disabled'].includes(thinking.type)) {
      throw new Error('thinking.type must be "enabled" or "disabled"');
    }

    if (thinking.budget_tokens !== undefined) {
      if (typeof thinking.budget_tokens !== 'number' || thinking.budget_tokens < 1) {
        throw new Error('thinking.budget_tokens must be a positive number');
      }
      if (thinking.budget_tokens > 8192) {
        throw new Error('thinking.budget_tokens cannot exceed 8192');
      }
    }
  }

  /**
   * 计算思考预算
   */
  static calculateThinkingBudget(userBudget?: number, maxTokens?: number, defaultMaxTokens: number = 4096): number {
    const maxTokensValue = maxTokens || defaultMaxTokens;
    
    if (userBudget) {
      // 用户指定了预算，确保在合理范围内
      return Math.max(256, Math.min(userBudget, Math.floor(maxTokensValue * 0.5)));
    }
    
    // 默认预算：最大token数的25%，但不低于256
    return Math.max(256, Math.floor(maxTokensValue * 0.25));
  }

  /**
   * 检查思考配置是否有效
   */
  static isValidThinkingConfig(thinking: any): boolean {
    try {
      this.validateThinkingConfig(thinking);
      return true;
    } catch {
      return false;
    }
  }
}
