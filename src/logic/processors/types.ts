// src/logic/processors/types.ts
/**
 * 处理器统一接口定义
 * 为所有处理器建立标准化的接口规范
 */

export interface ProcessContext {
  model: string;
  features: FeatureFlags;
  options: ProcessOptions;
  maxTokens?: number;
}

export interface FeatureFlags {
  thinking: boolean;
  tools: boolean;
  multimodal: boolean;
  streaming: boolean;
}

export interface ProcessOptions {
  [key: string]: any;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface IProcessor<TInput, TOutput> {
  process(input: TInput, context?: ProcessContext): TOutput;
  validate(input: TInput): ValidationResult;
}

// 流式处理相关接口
export interface StreamContext {
  originalRequest: any;
  features: FeatureFlags;
  messageId: string;
}

export interface StreamEvent {
  type: string;
  data: any;
}

export interface IStreamProcessor {
  createTransformer(
    source: ReadableStream,
    context: StreamContext
  ): ReadableStream;
  
  processEvent(event: StreamEvent): StreamEvent[];
}

// Claude相关类型定义
export interface ClaudeThinkingConfig {
  type: 'enabled' | 'disabled';
  budget_tokens?: number;
}

export interface GeminiThinkingConfig {
  includeThoughts: boolean;
  thinkingBudget?: number;
}

export interface ClaudeToolDefinition {
  name: string;
  description?: string;
  input_schema?: any;
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

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: any;
}

export interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  functionCall?: {
    name: string;
    args: any;
  };
}

export interface ContentItem {
  type: 'text' | 'image';
  text?: string;
  image?: any;
}

// 转换结果相关类型
export interface TransformResult {
  model: string;
  body: any;
  isStreaming: boolean;
  metadata?: TransformMetadata;
}

export interface TransformMetadata {
  thinkingEnabled?: boolean;
  toolsEnabled?: boolean;
  multimodalEnabled?: boolean;
  estimatedTokens?: number;
}
