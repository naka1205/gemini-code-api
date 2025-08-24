/**
 * 验证工具函数
 * 纯代理模式的API KEY和请求验证
 */
import { z } from 'zod';
import type { ClientType } from '../types/index.js';
import { AUTH_CONFIG } from './constants.js';

/**
 * 验证API密钥格式
 */
export function validateApiKey(apiKey: string): { valid: boolean; error?: string } {
  if (!apiKey || typeof apiKey !== 'string') {
    return { valid: false, error: 'API key is required and must be a string' };
  }

  if (apiKey.length < AUTH_CONFIG.MIN_API_KEY_LENGTH) {
    return { valid: false, error: `API key too short (minimum ${AUTH_CONFIG.MIN_API_KEY_LENGTH} characters)` };
  }

  if (apiKey.length > AUTH_CONFIG.MAX_API_KEY_LENGTH) {
    return { valid: false, error: `API key too long (maximum ${AUTH_CONFIG.MAX_API_KEY_LENGTH} characters)` };
  }

  // Gemini API 密钥通常以 AIza 开头
  if (!apiKey.startsWith('AIza') && !apiKey.match(/^[A-Za-z0-9_-]+$/)) {
    return { valid: false, error: 'Invalid API key format. Expected Gemini API key.' };
  }

  return { valid: true };
}

/**
 * 验证客户端类型
 */
export function validateClientType(clientType: string): clientType is ClientType {
  return ['openai', 'claude', 'gemini', 'unknown'].includes(clientType);
}

/**
 * 从字符串中提取多个API密钥
 */
export function extractApiKeys(keyString: string): string[] {
  if (!keyString || typeof keyString !== 'string') {
    return [];
  }

  return keyString
    .split(',')
    .map(key => key.trim())
    .filter(key => key.length > 0);
}

/**
 * 验证模型名称
 */
export function validateModel(model: string): { valid: boolean; error?: string } {
  if (!model || typeof model !== 'string') {
    return { valid: false, error: 'Model is required and must be a string' };
  }

  if (model.length === 0 || model.length > 100) {
    return { valid: false, error: 'Model name must be between 1 and 100 characters' };
  }

  return { valid: true };
}

/**
 * 验证请求参数
 */
export const StandardRequestSchema = z.object({
  model: z.string().min(1).max(100),
  messages: z.array(z.any()).optional(),
  stream: z.boolean().optional().default(false),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().min(1).max(8192).optional(),
  max_completion_tokens: z.number().min(1).max(8192).optional(),
  top_p: z.number().min(0).max(1).optional(),
  top_k: z.number().min(1).max(100).optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  seed: z.number().int().optional(),
  user: z.string().optional(),
}).passthrough(); // 允许额外字段

/**
 * 验证OpenAI请求
 */
export const OpenAIRequestSchema = StandardRequestSchema.extend({
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant', 'function', 'tool']),
    content: z.union([z.string(), z.array(z.any())]),
    name: z.string().optional(),
    function_call: z.any().optional(),
    tool_calls: z.array(z.any()).optional(),
    tool_call_id: z.string().optional(),
  })),
  functions: z.array(z.any()).optional(),
  function_call: z.any().optional(),
  tools: z.array(z.any()).optional(),
  tool_choice: z.any().optional(),
  response_format: z.object({
    type: z.enum(['text', 'json_object']),
  }).optional(),
});

/**
 * 验证Claude请求
 */
export const ClaudeRequestSchema = StandardRequestSchema.extend({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.union([z.string(), z.array(z.any())]),
  })),
  system: z.string().optional(),
  anthropic_version: z.string().optional(),
  anthropic_beta: z.array(z.string()).optional(),
});

/**
 * 验证Gemini请求
 */
export const GeminiRequestSchema = z.object({
  contents: z.array(z.object({
    parts: z.array(z.object({
      text: z.string().optional(),
      inlineData: z.object({
        mimeType: z.string(),
        data: z.string(),
      }).optional(),
      fileData: z.object({
        mimeType: z.string(),
        fileUri: z.string(),
      }).optional(),
    })),
    role: z.enum(['user', 'model']).optional(),
  })),
  tools: z.array(z.any()).optional(),
  toolConfig: z.any().optional(),
  safetySettings: z.array(z.object({
    category: z.string(),
    threshold: z.string(),
  })).optional(),
  systemInstruction: z.object({
    parts: z.array(z.any()),
  }).optional(),
  generationConfig: z.object({
    stopSequences: z.array(z.string()).optional(),
    responseMimeType: z.string().optional(),
    responseSchema: z.any().optional(),
    candidateCount: z.number().int().min(1).max(8).optional(),
    maxOutputTokens: z.number().int().min(1).max(8192).optional(),
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
    topK: z.number().int().min(1).max(100).optional(),
    presencePenalty: z.number().min(-2).max(2).optional(),
    frequencyPenalty: z.number().min(-2).max(2).optional(),
    responseLogprobs: z.boolean().optional(),
    logprobs: z.number().int().optional(),
  }).optional(),
}).passthrough();

/**
 * 验证IP地址格式
 */
export function validateIP(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;
  
  // IPv4 正则
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  // IPv6 正则 (简化版)
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * 清理和验证用户输入
 */
export function sanitizeInput(input: any): any {
  if (!AUTH_CONFIG.ENABLE_INPUT_SANITIZATION) {
    return input;
  }

  if (typeof input === 'string') {
    // 移除潜在的XSS和注入攻击
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  }

  if (Array.isArray(input)) {
    return input.map(item => sanitizeInput(item));
  }

  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }

  return input;
}

/**
 * 验证请求大小
 */
export function validateRequestSize(request: Request, maxSize: number): { valid: boolean; error?: string } {
  const contentLength = request.headers.get('content-length');
  
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (size > maxSize) {
      return {
        valid: false,
        error: `Request too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)}MB`,
      };
    }
  }
  
  return { valid: true };
}