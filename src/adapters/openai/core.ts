// OpenAI适配器核心模块
// 提供OpenAI适配器的基础类和通用功能

import { Buffer } from "node:buffer";

// 基础配置接口
export interface OpenAIConfig {
  apiKey: string;
  baseURL?: string;
  timeout?: number;
}

// HTTP错误类
export class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
  }
}

// CORS处理选项
export interface CorsOptions {
  headers?: Headers;
  status?: number;
  statusText?: string;
}

// OpenAI适配器核心基类
export class OpenAICore {
  protected config: OpenAIConfig;
  protected readonly BASE_URL = "https://generativelanguage.googleapis.com";
  protected readonly API_VERSION = "v1beta";
  protected readonly API_CLIENT = "genai-js/0.21.0";

  constructor(config: OpenAIConfig) {
    this.config = config;
  }

  // 创建请求头
  protected makeHeaders(apiKey?: string, more?: Record<string, string>): Record<string, string> {
    return {
      "x-goog-api-client": this.API_CLIENT,
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

  // CORS处理
  protected fixCors({ headers, status, statusText }: CorsOptions): CorsOptions {
    const newHeaders = new Headers(headers);
    newHeaders.set("Access-Control-Allow-Origin", "*");
    return { headers: newHeaders, status, statusText };
  }

  // OPTIONS请求处理
  protected async handleOPTIONS(): Promise<Response> {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*",
      }
    });
  }

  // 生成随机ID
  protected generateId(): string {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const randomChar = () => characters[Math.floor(Math.random() * characters.length)];
    return Array.from({ length: 29 }, randomChar).join("");
  }

  // 错误处理
  protected handleError(err: any): Response {
    console.error(err);
    return new Response(err.message, this.fixCors({ status: err.status ?? 500 }));
  }

  // 图片解析
  protected async parseImg(url: string): Promise<any> {
    let mimeType: string, data: string;
    if (url.startsWith("http://") || url.startsWith("https://")) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText} (${url})`);
        }
        mimeType = response.headers.get("content-type") || "";
        data = Buffer.from(await response.arrayBuffer()).toString("base64");
      } catch (err) {
        throw new Error("Error fetching image: " + (err instanceof Error ? err.message : String(err)));
      }
    } else {
      const match = url.match(/^data:(.*?)(;base64)?,(.*)$/);
      if (!match) {
        throw new HttpError("Invalid image data: " + url, 400);
      }
      mimeType = match[1];
      data = match[3];
    }
    return {
      inlineData: {
        mimeType,
        data,
      },
    };
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

  // 字段映射
  protected getFieldsMap(): Record<string, string> {
    return {
      frequency_penalty: "frequencyPenalty",
      max_completion_tokens: "maxOutputTokens",
      max_tokens: "maxOutputTokens",
      n: "candidateCount",
      presence_penalty: "presencePenalty",
      seed: "seed",
      stop: "stopSequences",
      temperature: "temperature",
      top_k: "topK",
      top_p: "topP",
    };
  }

  // 思考预算映射
  protected getThinkingBudgetMap(): Record<string, number> {
    return {
      low: 1024,
      medium: 8192,
      high: 24576,
    };
  }

  // 完成原因映射
  protected getReasonsMap(): Record<string, string> {
    return {
      "STOP": "stop",
      "MAX_TOKENS": "length",
      "SAFETY": "content_filter",
      "RECITATION": "content_filter",
    };
  }

  // OpenAI模型到Gemini模型的映射
  protected getModelMap(): Record<string, string> {
    return {
      // GPT-4 系列映射到非思考模型
      'gpt-4': 'gemini-2.5-flash',
      'gpt-4o': 'gemini-2.5-pro',
    };
  }

  // 映射OpenAI模型到Gemini模型
  protected mapOpenAIToGeminiModel(model: string): string {
    const modelMap = this.getModelMap();
    if (modelMap[model]) return modelMap[model];

    // 如果已经是Gemini模型，直接返回
    if (model.startsWith('gemini-') || model.startsWith('gemma-') || model.startsWith('learnlm-')) {
      return model;
    }

    // 默认回退到最低等级模型
    return 'gemini-2.0-flash';
  }
}