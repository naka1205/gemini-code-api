/**
 * 适配器相关类型定义
 * OpenAI、Claude、Gemini协议适配器类型
 */
import type { ClientType } from './common.js';
import type { StandardRequest } from './api.js';

// 适配器能力描述
export interface AdapterCapabilities {
  supportedModels: string[];
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsImages: boolean;
  supportsSystemMessages: boolean;
  maxTokens?: number;
  maxInputLength?: number;
}

// 适配器上下文
export interface AdapterContext {
  requestId: string;
  clientType: ClientType;
  apiKey: string;
  timestamp: number;
  userAgent?: string;
}

// 适配器性能指标
export interface AdapterMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  lastUsed: Date;
}

// OpenAI 类型定义
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
  content: string | OpenAIContent[];
  name?: string;
  function_call?: any;
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface OpenAIContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

export interface OpenAIRequest extends StandardRequest {
  messages: OpenAIMessage[];
  functions?: any[];
  function_call?: any;
  tools?: any[];
  tool_choice?: any;
  response_format?: {
    type: 'text' | 'json_object';
  };
}

// Claude 类型定义
export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContent[];
}

export interface ClaudeContent {
  type: 'text' | 'image';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface ClaudeRequest extends StandardRequest {
  messages: ClaudeMessage[];
  system?: string;
  anthropic_version?: string;
  anthropic_beta?: string[];
}

// Gemini 类型定义
export interface GeminiContent {
  parts: GeminiPart[];
  role?: 'user' | 'model';
}

export interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  fileData?: {
    mimeType: string;
    fileUri: string;
  };
  functionCall?: any;
  functionResponse?: any;
}

export interface GeminiRequest {
  contents: GeminiContent[];
  tools?: any[];
  toolConfig?: any;
  safetySettings?: GeminiSafetySetting[];
  systemInstruction?: GeminiContent;
  generationConfig?: {
    stopSequences?: string[];
    responseMimeType?: string;
    responseSchema?: any;
    candidateCount?: number;
    maxOutputTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    responseLogprobs?: boolean;
    logprobs?: number;
  };
}

export interface GeminiSafetySetting {
  category: string;
  threshold: string;
}