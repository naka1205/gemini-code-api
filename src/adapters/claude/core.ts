// Claude适配器核心模块
// 提供Claude适配器的基础类和通用功能

import type { ClaudeConfig  } from '../../types/claude';

// HTTP错误类
export class ClaudeHttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
  }
}

// Claude适配器核心基类
export class ClaudeCore {
  protected config: ClaudeConfig;
  protected readonly BASE_URL = "https://generativelanguage.googleapis.com";
  protected readonly API_VERSION = "v1beta";
  protected readonly API_CLIENT = "genai-js/0.21.0";

  constructor(config: ClaudeConfig) {
    this.config = config;
  }

  // 生成UUID
  protected generateUUID(): string {
    try {
      // 尝试使用crypto.randomUUID
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
      }
    } catch {}
    
    // 简单回退实现
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // JSON序列化
  protected json(obj: unknown): string {
    return JSON.stringify(obj);
  }

  // 基础响应头
  protected baseHeaders(): Record<string, string> {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version',
    };
  }

  // JSON响应头
  protected jsonHeaders(): Record<string, string> {
    return {
      ...this.baseHeaders(),
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    };
  }

  // SSE响应头
  protected sseHeaders(): Record<string, string> {
    return {
      ...this.baseHeaders(),
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'anthropic-version': '2023-06-01'
    };
  }

  // 获取请求ID
  protected getRequestId(): string {
    return `req_${this.generateUUID()}`;
  }

  // 安全提取Gemini错误
  protected safeExtractGeminiError(txt: string): string | null {
    try {
      const obj = JSON.parse(txt);
      return obj?.error?.message || null;
    } catch {
      return txt || null;
    }
  }

  // Anthropic错误格式
  protected anthropicError(status: number, message: string, type?: string): any {
    let t = type;
    if (!t) {
      switch (status) {
        case 400: t = 'invalid_request_error'; break;
        case 401: t = 'authentication_error'; break;
        case 403: t = 'permission_error'; break;
        case 404: t = 'not_found_error'; break;
        case 429: t = 'rate_limit_error'; break;
        default: t = status >= 500 ? 'api_error' : 'invalid_request_error';
      }
    }
    return { type: 'error', error: { type: t, message } };
  }

  // 创建请求头
  protected makeHeaders(apiKey?: string, more?: Record<string, string>): Record<string, string> {
    return {
      "x-goog-api-client": this.API_CLIENT,
      "Content-Type": "application/json",
      ...(apiKey && { "x-goog-api-key": apiKey }),
      ...more
    };
  }

  // 通用请求方法
  protected async makeRequest(endpoint: string, options: RequestInit): Promise<Response> {
    const url = `${this.BASE_URL}/${this.API_VERSION}/${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.makeHeaders(this.config.apiKey),
        ...options.headers
      }
    });

    return response;
  }

  // 模型映射：Claude -> Gemini
  protected getModelMap(): Record<string, string> {
    return {
      'claude-3-5-haiku-20241022': 'gemini-2.5-flash',
      'claude-3-5-sonnet-20241022': 'gemini-2.5-flash',
      'claude-3-7-sonnet-20250219': 'gemini-2.5-flash',
      'claude-sonnet-4-20250514': 'gemini-2.5-pro',
      'claude-opus-4-20250514': 'gemini-2.5-pro',
    };
  }

  // 映射Claude模型到Gemini模型
  protected mapClaudeToGeminiModel(model: string): string {
    const modelMap = this.getModelMap();
    if (modelMap[model]) return modelMap[model];

    // 如果已经是Gemini模型，直接返回
    if (model.startsWith('gemini-') || model.startsWith('gemma-') || model.startsWith('learnlm-')) {
      return model;
    }

    // 默认回退到最低等级模型
    return 'gemini-2.0-flash';
  }

  // 工具模式映射
  protected getToolModeMap(): Record<string, string> {
    return {
      'auto': 'AUTO',
      'any': 'ANY',
      'none': 'NONE',
    };
  }

  // 完成原因映射
  protected getFinishReasonMap(): Record<string, string> {
    return {
      'STOP': 'end_turn',
      'MAX_TOKENS': 'max_tokens',
      'SAFETY': 'error',
      'RECITATION': 'error',
    };
  }

  // 清理工具模式
  protected cleanToolMode(mode: string): string {
    const modeMap = this.getToolModeMap();
    return modeMap[mode] || 'AUTO';
  }

  // 清理工具模式
  protected cleanFinishReason(reason: string): string {
    const reasonMap = this.getFinishReasonMap();
    return reasonMap[reason] || 'end_turn';
  }

  // 错误处理
  protected handleError(err: any): Response {
    console.error('Claude adapter error:', err);
    
    let status = 500;
    let message = 'Internal server error';
    
    if (err instanceof ClaudeHttpError) {
      status = err.status;
      message = err.message;
    } else if (err.status) {
      status = err.status;
      message = err.message || 'Request failed';
    } else if (err.message) {
      message = err.message;
    }

    return new Response(JSON.stringify({
      type: 'error',
      error: {
        type: this.getErrorType(status),
        message
      }
    }), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'anthropic-version': '2023-06-01'
      }
    });
  }

  // 根据状态码获取错误类型
  protected getErrorType(status: number): string {
    switch (status) {
      case 400: return 'invalid_request_error';
      case 401: return 'authentication_error';
      case 403: return 'permission_error';
      case 404: return 'not_found_error';
      case 429: return 'rate_limit_error';
      default: return status >= 500 ? 'api_error' : 'invalid_request_error';
    }
  }

  // 安全设置
  protected getSafetySettings() {
    const harmCategory = [
      "HARM_CATEGORY_HATE_SPEECH",
      "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      "HARM_CATEGORY_DANGEROUS_CONTENT",
      "HARM_CATEGORY_HARASSMENT",
      "HARM_CATEGORY_CIVIC_INTEGRITY",
    ];

    return harmCategory.map(category => ({
      category,
      threshold: "BLOCK_NONE",
    }));
  }

  // 工具模式配置
  protected getToolConfig(toolChoice?: any) {
    if (!toolChoice) return { functionCallingConfig: { mode: 'AUTO' } };
    
    const choice = toolChoice.type || 'auto';
    if (choice === 'tool' && toolChoice.name) {
      return { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [toolChoice.name] } };
    } else if (choice === 'any') {
      return { functionCallingConfig: { mode: 'ANY' } };
    } else if (choice === 'none') {
      return { functionCallingConfig: { mode: 'NONE' } };
    } else {
      return { functionCallingConfig: { mode: 'AUTO' } };
    }
  }

  // 清理工具模式
  protected pruneToolSchema(schema: any): any {
    const visit = (node: any): any => {
      if (Array.isArray(node)) return node.map(visit);
      if (node && typeof node === 'object') {
        const result: any = {};
        for (const [k, v] of Object.entries(node)) {
          // 移除Gemini不支持的字段
          if (k === '$schema' || k === 'additionalProperties' || k === 'strict' || k === 'default') continue;
          // Gemini只支持enum/date-time格式，移除其他格式
          if (k === 'format' && typeof v === 'string' && v !== 'enum' && v !== 'date-time') continue;
          result[k] = visit(v);
        }
        return result;
      }
      return node;
    };
    return visit(schema ?? {});
  }
}
