// src/logic/processors/tools.ts

/**
 * 工具处理器 - 专门处理工具定义、工具调用等相关的数据结构转换
 * 遵循"只做数据结构转换，不处理对话内容"的原则
 */

export interface ToolDefinition {
  name: string;
  description?: string;
  input_schema?: any;
}

export interface ToolChoice {
  type?: 'tool';
  name?: string;
}

export interface GeminiTool {
  functionDeclarations: Array<{
    name: string;
    description: string;
    parameters: any;
  }>;
}

export interface GeminiToolConfig {
  functionCallingConfig: {
    mode: 'AUTO' | 'ANY' | 'NONE';
    allowedFunctionNames?: string[];
  };
}

export class ToolsProcessor {
  /**
   * 转换工具定义为Gemini格式
   * 只做结构转换，不处理内容
   */
  static convertTools(tools?: ToolDefinition[]): GeminiTool[] | undefined {
    if (!tools || tools.length === 0) {
      return undefined;
    }

    return [{
      functionDeclarations: tools.map(tool => ({
        name: tool.name,
        description: tool.description || '',
        parameters: this.cleanJsonSchema(tool.input_schema || {}),
      })),
    }];
  }

  /**
   * 转换工具选择为Gemini格式
   * 只做结构转换，不处理内容
   */
  static convertToolChoice(toolChoice?: 'auto' | 'none' | ToolChoice): GeminiToolConfig | undefined {
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
   * 清理 JSON Schema 中 Gemini API 不支持的字段
   * 只清理结构，不修改内容
   */
  static cleanJsonSchema(schema: any): any {
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
