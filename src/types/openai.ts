// OpenAI API类型定义

// 消息内容部分
export interface ContentPart {
  type: 'text' | 'image_url' | 'input_audio';
  text?: string;
  image_url?: { url: string };
  input_audio?: { format: string; data: string };
}

// 工具调用
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// OpenAI消息
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

// 工具定义
export interface Tool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: any;
    strict?: boolean;
  };
}

// 响应格式
export interface ResponseFormat {
  type: 'json_schema' | 'json_object' | 'text';
  json_schema?: {
    schema: any;
  };
}

// OpenAI请求
export interface OpenAIRequest {
  model?: string;
  messages?: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  top_p?: number;
  top_k?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  stream?: boolean;
  stream_options?: { include_usage?: boolean };
  tools?: Tool[];
  tool_choice?: string | { type: 'function'; function: { name: string } };
  response_format?: ResponseFormat;
  reasoning_effort?: 'low' | 'medium' | 'high';
  seed?: number;
  n?: number;
  input?: string | string[];
  dimensions?: number;
  extra_body?: {
    google?: {
      safety_settings?: any[];
      cached_content?: string;
    };
  };
}

// OpenAI选择
export interface OpenAIChoice {
  index: number;
  message?: any;
  delta?: any;
  logprobs: null;
  finish_reason: string | null;
}

// OpenAI响应
export interface OpenAIResponse {
  id: string;
  choices: OpenAIChoice[];
  created: number;
  model: string;
  object: string;
  usage?: {
    completion_tokens?: number;
    prompt_tokens?: number;
    total_tokens?: number;
  };
}

// Gemini请求
export interface GeminiRequest {
  contents?: any[];
  system_instruction?: any;
  safetySettings?: any[];
  generationConfig?: any;
  tools?: any[];
  tool_config?: any;
  cachedContent?: string;
}

// Gemini候选
export interface GeminiCandidate {
  index?: number;
  content?: {
    parts?: any[];
  };
  finishReason?: string;
}

// Gemini响应
export interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: {
    candidatesTokenCount?: number;
    promptTokenCount?: number;
    totalTokenCount?: number;
  };
  promptFeedback?: {
    blockReason?: string;
    safetyRatings?: any[];
  };
  modelVersion?: string;
}