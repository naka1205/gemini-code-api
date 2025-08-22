/**
 * API相关类型定义
 * 通用API接口和响应格式
 */

// Token使用统计
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// 标准请求接口
export interface StandardRequest {
  model: string;
  messages?: any[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  top_p?: number;
  top_k?: number;
  stop?: string[];
  frequency_penalty?: number;
  presence_penalty?: number;
  seed?: number;
  user?: string;
  [key: string]: any;
}

// 标准响应接口
export interface StandardResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: any[];
  usage?: TokenUsage;
  system_fingerprint?: string;
}

// 流式数据块
export interface StreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: StreamChoice[];
  usage?: Partial<TokenUsage>;
}

export interface StreamChoice {
  index: number;
  delta: {
    role?: string;
    content?: string;
  };
  finish_reason?: string | null;
}

// 错误响应格式
export interface ApiError {
  error: {
    message: string;
    type: string;
    param?: string;
    code?: string | number;
  };
}

// 健康检查响应
export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: number;
  version: string;
  services: {
    database: 'healthy' | 'unhealthy';
    cache: 'healthy' | 'unhealthy';
    load_balancer: 'healthy' | 'unhealthy';
  };
  uptime: number;
}

// 模型信息
export interface ModelInfo {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

// 模型列表响应
export interface ModelsResponse {
  object: string;
  data: ModelInfo[];
}