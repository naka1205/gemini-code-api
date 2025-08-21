// Claude适配器核心模块
// 提供Claude适配器的基础类和通用功能

// 基础配置接口
export interface ClaudeConfig {
  apiKey: string;
  version?: string;
  timeout?: number;
}

// Claude适配器核心基类
export class ClaudeCore {
  protected config: ClaudeConfig;
  protected readonly BASE_URL = 'https://generativelanguage.googleapis.com';
  protected readonly API_VERSION = 'v1beta';

  constructor(config: ClaudeConfig) {
    this.config = config;
  }

  // 生成UUID
  protected generateUUID(): string {
    try {
      // Workers/Nitro usually provides crypto.randomUUID
      const crypto = (globalThis as any)?.crypto;
      const v = crypto?.randomUUID?.();
      if (typeof v === 'string' && v.length > 0) return v;
    } catch { }

    // Simple fallback
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

  // 模型映射
  protected getModelMap(): Record<string, string> {
    return {
      // 统一映射到 2.5 系列（已确认包含推理）
      'claude-3-7-sonnet-20250219': 'gemini-2.5-flash',
      'claude-sonnet-4-20250514': 'gemini-2.5-flash',
      'claude-opus-4-20250514': 'gemini-2.5-pro',
      'claude-opus-4-1-20250805': 'gemini-2.5-pro',
    };
  }

  // 映射Claude模型到Gemini模型
  protected mapClaudeToGeminiModel(model: string): string {
    const modelMap = this.getModelMap();
    if (modelMap[model]) return modelMap[model];
    // Fallback
    return 'gemini-2.0-flash';
  }

  // 工具schema修剪（Gemini约束）
  protected pruneToolSchema(schema: any): any {
    const visit = (node: any): any => {
      if (Array.isArray(node)) return node.map(visit);
      if (node && typeof node === 'object') {
        const result: any = {};
        for (const [k, v] of Object.entries(node)) {
          if (k === '$schema' || k === 'additionalProperties' || k === 'strict' || k === 'default') continue;
          // Gemini only supports enum/date-time for string formats; remove others to be safe
          if (k === 'format' && typeof v === 'string' && v !== 'enum' && v !== 'date-time') continue;
          result[k] = visit(v);
        }
        return result;
      }
      return node;
    };
    return visit(schema ?? {});
  }

  // 通用请求方法
  protected async makeRequest(endpoint: string, options: RequestInit): Promise<Response> {
    const url = `${this.BASE_URL}/${this.API_VERSION}/${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.config.apiKey,
        ...options.headers
      }
    });

    return response;
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

  // CORS响应头
  protected corsHeaders(): Record<string, string> {
    return this.baseHeaders();
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

  // 错误处理
  protected handleError(err: any): Response {
    console.error(err);
    const message = err?.message || 'Internal server error';
    return new Response(
      this.json(this.anthropicError(500, message, 'api_error')),
      {
        status: 500,
        headers: this.jsonHeaders()
      }
    );
  }

  // OPTIONS请求处理
  protected handleOPTIONS(): Response {
    return new Response(null, {
      status: 200,
      headers: this.corsHeaders()
    });
  }

  // 验证API密钥
  protected validateApiKey(request: Request, env?: any): string | null {
    // API key (Anthropic uses x-api-key)
    let apiKey = request.headers.get('x-api-key');
    if (!apiKey) {
      const auth = request.headers.get('Authorization');
      if (auth && auth.startsWith('Bearer ')) apiKey = auth.slice(7);
    }
    if (!apiKey) apiKey = env?.GEMINI_API_KEY;
    return apiKey || null;
  }

  // 创建认证错误响应
  protected createAuthError(requestId: string): Response {
    return new Response(
      this.json(this.anthropicError(401, 'API key not valid. Please pass a valid API key.', 'authentication_error')),
      {
        status: 401,
        headers: {
          ...this.jsonHeaders(),
          'x-request-id': requestId
        }
      }
    );
  }

  // 创建404错误响应
  protected createNotFoundError(requestId: string): Response {
    return new Response(
      this.json(this.anthropicError(404, 'Endpoint not supported', 'not_found_error')),
      {
        status: 404,
        headers: {
          ...this.jsonHeaders(),
          'x-request-id': requestId
        }
      }
    );
  }

  // 获取请求ID
  protected getRequestId(): string {
    return `req_${this.generateUUID()}`;
  }

  // 检查是否为流式请求
  protected isStreamRequest(body: any, request: Request): boolean {
    const acceptHeader = request.headers.get('accept') || '';
    return (body?.stream === true) || acceptHeader.toLowerCase().includes('text/event-stream');
  }

  // 构建模型路径
  protected buildModelPath(model: string): string {
    return encodeURIComponent(model);
  }

  // 记录调试信息
  protected logDebug(requestId: string, model: string, stream: boolean, body: any): void {
    try {
      const out = JSON.stringify(body);
      console.log('[DEBUG][', requestId, '] model=', model, ' stream=', !!stream, ' body.len=', out.length);
      console.log('[DEBUG][', requestId, '] body.sample=', out.slice(0, 800));
    } catch { }
  }
}