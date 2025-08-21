// Claude API类型定义

// 基础配置接口
export interface ClaudeConfig {
  apiKey: string;
  baseURL?: string;
  timeout?: number;
}

// 内容块类型
export interface ContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result' | 'thinking' | 'redacted_thinking';
  // text block
  text?: string;
  // thinking block
  thinking?: string;
  signature?: string;
  // image block
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
  // tool blocks
  name?: string;
  input?: any;
  tool_use_id?: string;
  id?: string; // for tool_use blocks
  // generic nested content
  content?: string | ContentBlock[];
}

// Claude消息
export interface ClaudeMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
}

// 工具定义
export interface ClaudeTool {
  name: string;
  description?: string;
  input_schema: any;
}

// 工具选择
export interface ToolChoice {
  type: 'auto' | 'any' | 'tool' | 'none';
  name?: string;
}

// Claude请求
export interface ClaudeRequest {
  model: string;
  messages: ClaudeMessage[];
  system?: string | ContentBlock[];
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  tools?: ClaudeTool[];
  tool_choice?: ToolChoice;
}

// Claude响应使用情况
export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

// Claude响应
export interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: ContentBlock[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | 'error';
  stop_sequence: string | null;
  usage: ClaudeUsage;
}

// 流式事件类型
export type StreamEventType = 
  | 'message_start'
  | 'message_delta' 
  | 'message_stop'
  | 'content_block_start'
  | 'content_block_delta'
  | 'content_block_stop'
  | 'ping';

// 流式事件
export interface ClaudeStreamEvent {
  type: StreamEventType;
  message?: Partial<ClaudeResponse>;
  index?: number;
  content_block?: ContentBlock;
  delta?: {
    type: 'text_delta' | 'input_json_delta' | 'thinking_delta' | 'signature_delta';
    text?: string; // for text_delta
    partial_json?: string; // for input_json_delta
    thinking?: string; // for thinking_delta
    signature?: string; // for signature_delta
    stop_reason?: string;
    stop_sequence?: string | null;
  };
  usage?: Partial<ClaudeUsage>;
}

// Gemini请求格式
export interface GeminiClaudeRequest {
  contents: any[];
  systemInstruction?: any;
  generationConfig: any;
  tools?: any[];
  toolConfig?: any;
}

// Gemini响应格式
export interface GeminiClaudeResponse {
  candidates?: Array<{
    content?: {
      parts?: any[];
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

// 错误响应
export interface ClaudeError {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}
