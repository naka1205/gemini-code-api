// src/logic/processors/tools.ts

/**
 * 工具处理器 - 专门处理工具定义、工具调用等相关的数据结构转换
 * 支持Claude工具调用到Gemini函数调用的转换
 */

import { 
  IProcessor, 
  ValidationResult,
  ClaudeToolDefinition,
  GeminiTool,
  GeminiToolConfig 
} from './types';

export class ToolsProcessor implements IProcessor<ClaudeToolDefinition[], GeminiTool[]> {
  /**
   * 实现IProcessor接口的process方法
   */
  process(input: ClaudeToolDefinition[]): GeminiTool[] {
    if (!input || input.length === 0) {
      return [];
    }

    // 简化逻辑：直接将所有工具转换为Gemini格式，不再区分特殊工具
    const functionDeclarations = input.map(tool => ({
      name: tool.name,
      description: tool.description || '',
      parameters: this.cleanJsonSchema(tool.input_schema || {}),
    }));

    if (functionDeclarations.length === 0) {
      return [];
    }

    return [{ functionDeclarations }];
  }

  /**
   * 实现IProcessor接口的validate方法
   */
  validate(input: ClaudeToolDefinition[]): ValidationResult {
    const errors: string[] = [];
    
    if (!Array.isArray(input)) {
      errors.push('tools must be an array');
      return { isValid: false, errors };
    }
    
    input.forEach((tool: any, index: number) => {
      if (!tool.name) {
        errors.push(`Field "name" is required at tools[${index}]`);
      }
      
      if (tool.input_schema && typeof tool.input_schema !== 'object') {
        errors.push(`Field "input_schema" must be an object at tools[${index}]`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 静态方法：转换工具定义为Gemini格式（向后兼容）
   */
  static convertTools(tools?: ClaudeToolDefinition[]): GeminiTool[] | undefined {
    const processor = new ToolsProcessor();
    return processor.process(tools || []);
  }

  /**
   * 支持Claude特殊工具转换
   */
  convertSpecialTools(claudeTools: any[]): GeminiTool[] {
    return claudeTools.map(tool => {
      // 支持bash工具 - Claude 4/3.7版本
      if (tool.type === 'bash_20250124') {
        return {
          functionDeclarations: [{
            name: 'bash',
            description: 'Execute bash commands in a persistent session (Claude 4/3.7)',
            parameters: {
              type: 'object',
              properties: {
                command: {
                  type: 'string',
                  description: 'The bash command to execute'
                },
                restart: {
                  type: 'boolean',
                  description: 'Restart the bash session'
                }
              },
              required: ['command']
            }
          }]
        };
      }
      
      // 支持bash工具 - Claude 3.5版本
      if (tool.type === 'bash_20241022') {
        return {
          functionDeclarations: [{
            name: 'bash',
            description: 'Execute bash commands in a persistent session (Claude 3.5)',
            parameters: {
              type: 'object',
              properties: {
                command: {
                  type: 'string',
                  description: 'The bash command to execute'
                },
                restart: {
                  type: 'boolean',
                  description: 'Restart the bash session'
                }
              },
              required: ['command']
            }
          }]
        };
      }
      
      // 支持text editor工具 - Claude 4版本
      if (tool.type === 'text_editor_20250728') {
        return {
          functionDeclarations: [{
            name: 'str_replace_based_edit_tool',
            description: 'View, edit, and manage text files using string replacement',
            parameters: {
              type: 'object',
              properties: {
                command: {
                  type: 'string',
                  enum: ['view', 'str_replace', 'create', 'insert'],
                  description: 'The command to execute'
                },
                path: {
                  type: 'string',
                  description: 'The file path'
                },
                old_text: {
                  type: 'string',
                  description: 'The text to replace (for str_replace command)'
                },
                new_text: {
                  type: 'string',
                  description: 'The replacement text (for str_replace command)'
                },
                content: {
                  type: 'string',
                  description: 'The content to write (for create command)'
                },
                text: {
                  type: 'string',
                  description: 'The text to insert (for insert command)'
                },
                position: {
                  type: 'number',
                  description: 'The position to insert text (for insert command)'
                }
              },
              required: ['command', 'path']
            }
          }]
        };
      }
      
      // 支持text editor工具 - Claude 3.7版本
      if (tool.type === 'text_editor_20250124') {
        return {
          functionDeclarations: [{
            name: 'str_replace_editor',
            description: 'View, edit, and manage text files with undo support',
            parameters: {
              type: 'object',
              properties: {
                command: {
                  type: 'string',
                  enum: ['view', 'str_replace', 'create', 'insert', 'undo_edit'],
                  description: 'The command to execute'
                },
                path: {
                  type: 'string',
                  description: 'The file path'
                },
                old_text: {
                  type: 'string',
                  description: 'The text to replace (for str_replace command)'
                },
                new_text: {
                  type: 'string',
                  description: 'The replacement text (for str_replace command)'
                },
                content: {
                  type: 'string',
                  description: 'The content to write (for create command)'
                },
                text: {
                  type: 'string',
                  description: 'The text to insert (for insert command)'
                },
                position: {
                  type: 'number',
                  description: 'The position to insert text (for insert command)'
                }
              },
              required: ['command', 'path']
            }
          }]
        };
      }
      
      // 支持text editor工具 - Claude 3.5版本
      if (tool.type === 'text_editor_20241022') {
        return {
          functionDeclarations: [{
            name: 'str_replace_editor',
            description: 'View, edit, and manage text files with undo support (Claude 3.5)',
            parameters: {
              type: 'object',
              properties: {
                command: {
                  type: 'string',
                  enum: ['view', 'str_replace', 'create', 'insert', 'undo_edit'],
                  description: 'The command to execute'
                },
                path: {
                  type: 'string',
                  description: 'The file path'
                },
                old_text: {
                  type: 'string',
                  description: 'The text to replace (for str_replace command)'
                },
                new_text: {
                  type: 'string',
                  description: 'The replacement text (for str_replace command)'
                },
                content: {
                  type: 'string',
                  description: 'The content to write (for create command)'
                },
                text: {
                  type: 'string',
                  description: 'The text to insert (for insert command)'
                },
                position: {
                  type: 'number',
                  description: 'The position to insert text (for insert command)'
                }
              },
              required: ['command', 'path']
            }
          }]
        };
      }
      
      // 默认工具转换
      return this.convertStandardTool(tool);
    });
  }

  /**
   * 工具参数格式验证（不执行实际操作）
   */
  validateToolParameters(toolType: string, parameters: any): boolean {
    // 验证bash工具参数格式
    if (toolType === 'bash_20250124' || toolType === 'bash_20241022') {
      // 如果使用restart参数，command不是必需的
      if (parameters.restart === true) {
        return true;
      }
      // 否则command是必需的
      return parameters.command && typeof parameters.command === 'string';
    }
    
    // 验证text editor工具参数格式
    if (toolType === 'text_editor_20250728' || 
        toolType === 'text_editor_20250124' || 
        toolType === 'text_editor_20241022') {
      
      // 基本验证
      if (!parameters.command || !parameters.path) {
        return false;
      }
      
      // 命令特定验证
      const validCommands = ['view', 'str_replace', 'create', 'insert'];
      if (toolType !== 'text_editor_20250728') {
        validCommands.push('undo_edit'); // Claude 3.7/3.5支持撤销
      }
      
      if (!validCommands.includes(parameters.command)) {
        return false;
      }
      
      // str_replace命令需要old_text和new_text
      if (parameters.command === 'str_replace') {
        return parameters.old_text !== undefined && parameters.new_text !== undefined;
      }
      
      // create命令需要content
      if (parameters.command === 'create') {
        return parameters.content !== undefined;
      }
      
      // insert命令需要text和position
      if (parameters.command === 'insert') {
        return parameters.text !== undefined && parameters.position !== undefined;
      }
      
      return true; // view和undo_edit命令只需要path
    }
    
    return true; // 其他工具使用默认验证
  }

  /**
   * 转换工具选择为Gemini格式
   * 只做结构转换，不处理内容
   */
  static convertToolChoice(toolChoice?: 'auto' | 'none' | { type: 'tool'; name: string }): GeminiToolConfig | undefined {
    if (!toolChoice) {
      return undefined;
    }

    let mode: 'AUTO' | 'ANY' | 'NONE' = 'AUTO';
    let allowedFunctionNames: string[] | undefined = undefined;

    if (typeof toolChoice === 'string') {
      if (toolChoice === 'auto') {
        mode = 'AUTO';
      } else if (toolChoice === 'none') {
        mode = 'NONE';
      }
    } else if (toolChoice.type === 'tool' && toolChoice.name) {
      mode = 'ANY';
      allowedFunctionNames = [toolChoice.name];
    }

    return {
      functionCallingConfig: {
        mode: mode,
        ...(allowedFunctionNames && { allowedFunctionNames: allowedFunctionNames }),
      },
    };
  }

  /**
   * 转换标准工具
   */
  private convertStandardTool(tool: any): GeminiTool {
    return {
      functionDeclarations: [{
        name: tool.name,
        description: tool.description || '',
        parameters: this.cleanJsonSchema(tool.input_schema || {}),
      }]
    };
  }

  /**
   * 清理 JSON Schema 中 Gemini API 不支持的字段
   * 只清理结构，不修改内容
   */
  private cleanJsonSchema(schema: any): any {
    if (!schema || typeof schema !== 'object') {
      return schema;
    }

    // 创建副本以避免修改原始对象
    const cleaned = JSON.parse(JSON.stringify(schema));

    // 递归清理函数
    const cleanObject = (obj: any): any => {
      if (!obj || typeof obj !== 'object') {
        return obj;
      }

      if (Array.isArray(obj)) {
        return obj.map(cleanObject);
      }

      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // 跳过 Gemini API 不支持的字段
        if (key === 'additionalProperties' || key === '$schema') {
          continue;
        }
        result[key] = cleanObject(value);
      }
      return result;
    };

    return cleanObject(cleaned);
  }

  /**
   * 生成标准格式的tool_use ID
   * 只生成ID，不生成内容
   */
  static generateToolUseId(): string {
    // 生成类似 "toolu_01A09q90qw90lq917835lq9" 的格式
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 15);
    return `toolu_${timestamp}${random}`.substring(0, 24);
  }

  /**
   * 静态方法：清理JSON Schema（向后兼容）
   */
  static cleanJsonSchema(schema: any): any {
    const processor = new ToolsProcessor();
    return processor.cleanJsonSchema(schema);
  }

  /**
   * 验证工具定义
   * 只做验证，不修改内容
   */
  static validateTools(tools: any[]): void {
    if (!Array.isArray(tools)) {
      throw new Error('Field "tools" must be an array');
    }
    
    tools.forEach((tool: any, index: number) => {
      if (!tool.name) {
        throw new Error(`Field "name" is required at tools[${index}]`);
      }
      
      if (tool.input_schema && typeof tool.input_schema !== 'object') {
        throw new Error(`Field "input_schema" must be an object at tools[${index}]`);
      }
    });
  }

  /**
   * 验证工具选择配置
   * 只做验证，不修改内容
   */
  static validateToolChoice(toolChoice: any): void {
    if (toolChoice === undefined || toolChoice === null) {
      return; // 允许未定义
    }

    if (typeof toolChoice === 'string') {
      if (!['auto', 'none'].includes(toolChoice)) {
        throw new Error('Field "tool_choice" must be "auto", "none", or an object');
      }
    } else if (typeof toolChoice === 'object') {
      if (toolChoice.type !== 'tool') {
        throw new Error('Field "tool_choice.type" must be "tool" when tool_choice is an object');
      }
      if (!toolChoice.name || typeof toolChoice.name !== 'string') {
        throw new Error('Field "tool_choice.name" is required and must be a string when tool_choice.type is "tool"');
      }
    } else {
      throw new Error('Field "tool_choice" must be a string or object');
    }
  }
}
