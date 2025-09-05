// src/api/validators/claude.ts
import { ValidationError } from '../../common/errors';

export class ClaudeValidator {
  public static async validate(request: Request): Promise<any> {
    const body = await this.parseBody(request);

    // 核心字段验证
    this.validateRequired(body.model, 'model');
    this.validateRequired(body.messages, 'messages');
    this.validateArray(body.messages, 'messages');
    this.validateMessages(body.messages);

    // 可选参数验证
    if (body.max_tokens !== undefined) {
      // 允许数字字符串，安全转换
      const coerced = typeof body.max_tokens === 'string' ? Number(body.max_tokens) : body.max_tokens;
      if (!Number.isFinite(coerced)) {
        throw new ValidationError('Field "max_tokens" must be a number');
      }
      // 兼容处理：当 <= 0 时视为未提供，交由后续默认值处理
      if (coerced <= 0) {
        delete body.max_tokens;
      } else {
        this.validateNumberRange(coerced, 'max_tokens', 1, 8192);
        body.max_tokens = coerced;
      }
    }
    if (body.temperature !== undefined) {
      this.validateNumberRange(body.temperature, 'temperature', 0, 1);
    }
    if (body.top_p !== undefined) {
      this.validateNumberRange(body.top_p, 'top_p', 0, 1);
    }
    if (body.top_k !== undefined) {
      this.validateNumberRange(body.top_k, 'top_k', 1, 1000);
    }
    if (body.stop_sequences !== undefined) {
      this.validateArray(body.stop_sequences, 'stop_sequences');
    }
    if (body.tools) {
      this.validateArray(body.tools, 'tools');
    }
    
    // 验证成功后，返回完整的原始body
    return body;
  }

  private static async parseBody(request: Request): Promise<any> {
    try {
      return await request.json();
    } catch (e) {
      throw new ValidationError('Invalid JSON request body');
    }
  }

  private static validateRequired(field: any, fieldName: string): void {
    if (field === undefined || field === null) {
      throw new ValidationError(`Field "${fieldName}" is required`);
    }
  }

  private static validateArray(field: any, fieldName: string): void {
    if (!Array.isArray(field)) {
      throw new ValidationError(`Field "${fieldName}" must be an array`);
    }
  }

  private static validateNumber(field: any, fieldName: string): void {
    if (typeof field !== 'number') {
      throw new ValidationError(`Field "${fieldName}" must be a number`);
    }
  }
  
  private static validateNumberRange(field: any, fieldName: string, min: number, max: number): void {
    this.validateNumber(field, fieldName);
    if (field < min || field > max) {
      throw new ValidationError(`Field "${fieldName}" must be between ${min} and ${max}`);
    }
  }

  private static validateMessages(messages: any[]): void {
    if (messages.length === 0) {
      throw new ValidationError('Field "messages" must not be empty');
    }

    let lastRole: string | null = null;
    messages.forEach((message, index) => {
      const fieldPath = `messages[${index}]`;
      this.validateRequired(message.role, `${fieldPath}.role`);
      this.validateRequired(message.content, `${fieldPath}.content`);

      if (!['user', 'assistant'].includes(message.role)) {
        throw new ValidationError(`Invalid role "${message.role}" in ${fieldPath}. Must be "user" or "assistant"`);
      }

      if (index > 0 && message.role === lastRole) {
        throw new ValidationError(`Messages must alternate between "user" and "assistant"`);
      }

      lastRole = message.role;
    });
  }
}
