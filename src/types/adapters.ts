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
  type: 'text' | 'tool_use' | 'thinking';
  text?: string;
  thinking?: string;
  tool_use?: {
    id: string;
    name: string;
    input: Record<string, any>;
  };
}

export interface ClaudeRequest extends StandardRequest {
  messages: ClaudeMessage[];
  system?: string;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  tools?: ClaudeTool[];
  tool_choice?: 'auto' | 'none' | { type: 'tool'; name: string };
  anthropic_version?: string;
  anthropic_beta?: string[];
  // 添加 Extended Thinking 支持
  thinking?: {
    type: "enabled" | "disabled";
    budget_tokens?: number;
  };
}

export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: ClaudeContent[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
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
    // 添加 Thinking 配置支持
    thinkingConfig?: {
      includeThoughts: boolean;
      thinkingBudget: number;
    };
  };
}

export interface GeminiSafetySetting {
  category: string;
  threshold: string;
}