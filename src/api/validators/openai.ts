// src/api/validators/openai.validator.ts

import { ValidationError } from '../../common/errors';

export class OpenAIValidator {
  public static async validate(request: Request): Promise<any> {
    const body = await this.parseBody(request);

    this.validateRequired(body.model, 'model');
    this.validateRequired(body.messages, 'messages');
    this.validateArray(body.messages, 'messages');

    this.validateMessages(body.messages);

    if (body.max_tokens !== undefined) {
      this.validateNumber(body.max_tokens, 'max_tokens');
    }
    if (body.temperature !== undefined) {
      this.validateNumberRange(body.temperature, 'temperature', 0, 2);
    }
    if (body.top_p !== undefined) {
      this.validateNumberRange(body.top_p, 'top_p', 0, 1);
    }

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

    messages.forEach((message, index) => {
      const fieldPath = `messages[${index}]`;
      this.validateRequired(message.role, `${fieldPath}.role`);
      this.validateRequired(message.content, `${fieldPath}.content`);

      if (!['system', 'user', 'assistant', 'tool'].includes(message.role)) {
        throw new ValidationError(`Invalid role "${message.role}" in ${fieldPath}`);
      }

      if (typeof message.content !== 'string' && !Array.isArray(message.content)) {
        throw new ValidationError(`${fieldPath}.content must be a string or an array of parts`);
      }

      // Validate tool calls if present
      if (message.tool_calls) {
        this.validateArray(message.tool_calls, `${fieldPath}.tool_calls`);
        message.tool_calls.forEach((toolCall: any, tcIndex: number) => {
          const tcPath = `${fieldPath}.tool_calls[${tcIndex}]`;
          this.validateRequired(toolCall.id, `${tcPath}.id`);
          this.validateRequired(toolCall.type, `${tcPath}.type`);
          this.validateRequired(toolCall.function, `${tcPath}.function`);
          this.validateRequired(toolCall.function.name, `${tcPath}.function.name`);
        });
      }
    });
  }

  private static validateTools(tools: any[]): void {
    tools.forEach((tool, index) => {
      const fieldPath = `tools[${index}]`;
      this.validateRequired(tool.type, `${fieldPath}.type`);
      
      if (tool.type === 'function') {
        this.validateRequired(tool.function, `${fieldPath}.function`);
        this.validateRequired(tool.function.name, `${fieldPath}.function.name`);
        
        if (tool.function.parameters) {
          this.validateRequired(tool.function.parameters.type, `${fieldPath}.function.parameters.type`);
        }
      }
    });
  }

  private static validateToolChoice(toolChoice: any, tools: any[]): void {
    if (typeof toolChoice === 'string') {
      if (!['none', 'auto', 'required'].includes(toolChoice)) {
        throw new ValidationError('tool_choice string must be "none", "auto", or "required"');
      }
    } else if (typeof toolChoice === 'object' && toolChoice !== null) {
      if (toolChoice.type === 'function') {
        this.validateRequired(toolChoice.function, 'tool_choice.function');
        this.validateRequired(toolChoice.function.name, 'tool_choice.function.name');
        
        if (tools && !tools.some((tool: any) => tool.function?.name === toolChoice.function.name)) {
          throw new ValidationError(`Function "${toolChoice.function.name}" not found in tools array`);
        }
      }
    }
  }
}