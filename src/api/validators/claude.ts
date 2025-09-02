
// src/api/validators/claude.validator.ts

import { ValidationError } from '../../common/errors';

export class ClaudeValidator {
  public static async validate(request: Request): Promise<any> {
    const body = await this.parseBody(request);

    this.validateRequired(body.model, 'model');
    this.validateRequired(body.messages, 'messages');
    this.validateArray(body.messages, 'messages');
    this.validateRequired(body.max_tokens, 'max_tokens');
    this.validateNumber(body.max_tokens, 'max_tokens');

    this.validateMessages(body.messages);

    // Validate tools if present
    if (body.tools) {
      this.validateArray(body.tools, 'tools');
      this.validateTools(body.tools);
    }

    // Validate tool_choice if present
    if (body.tool_choice) {
      this.validateToolChoice(body.tool_choice, body.tools);
    }

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

  private static validateMessages(messages: any[]): void {
    if (messages.length === 0) {
      throw new ValidationError('Field "messages" must not be empty');
    }

    messages.forEach((message, index) => {
      const fieldPath = `messages[${index}]`;
      this.validateRequired(message.role, `${fieldPath}.role`);
      this.validateRequired(message.content, `${fieldPath}.content`);
      
      if (!['user', 'assistant'].includes(message.role)) {
        throw new ValidationError(`Invalid role at ${fieldPath}. Must be "user" or "assistant"`);
      }
    });
  }

  private static validateTools(tools: any[]): void {
    tools.forEach((tool, index) => {
      const fieldPath = `tools[${index}]`;
      this.validateRequired(tool.name, `${fieldPath}.name`);
      
      if (tool.input_schema) {
        this.validateRequired(tool.input_schema.type, `${fieldPath}.input_schema.type`);
      }
    });
  }

  private static validateToolChoice(toolChoice: any, tools: any[]): void {
    if (typeof toolChoice === 'string') {
      if (!['auto', 'any', 'none'].includes(toolChoice)) {
        throw new ValidationError('tool_choice string must be "auto", "any", or "none"');
      }
    } else if (typeof toolChoice === 'object' && toolChoice !== null) {
      if (toolChoice.type === 'tool') {
        this.validateRequired(toolChoice.name, 'tool_choice.name');
        
        if (tools && !tools.some((tool: any) => tool.name === toolChoice.name)) {
          throw new ValidationError(`Tool "${toolChoice.name}" not found in tools array`);
        }
      }
    }
  }
}
