/**
 * 认证相关类型定义
 * 纯代理模式认证和KEY管理
 */
import type { ClientType } from './common.js';

// 认证结果
export interface AuthResult {
  isValid: boolean;
  clientType: ClientType;
  apiKeys: string[];
  errors?: string[];
}

// 客户端信息
export interface ClientInfo {
  type: ClientType;
  ip: string;
  userAgent: string;
  apiKeys?: string[];
  keyHashes?: string[];
}

// API密钥验证结果
export interface KeyValidationResult {
  valid: boolean;
  error?: string;
  keyHash?: string;
}

// 认证上下文
export interface AuthContext {
  requestId: string;
  clientInfo: ClientInfo;
  selectedApiKey?: string;
  selectedKeyHash?: string;
  timestamp: number;
}

// API密钥提取结果
export interface KeyExtractionResult {
  keys: string[];
  source: 'authorization' | 'x-api-key' | 'x-goog-api-key' | 'query-param';
  clientType: ClientType;
}

// 认证错误类型
export enum AuthErrorType {
  NO_API_KEY = 'no_api_key',
  INVALID_API_KEY = 'invalid_api_key',
  INVALID_FORMAT = 'invalid_format',
  KEY_TOO_SHORT = 'key_too_short',
  KEY_TOO_LONG = 'key_too_long',
  UNSUPPORTED_CLIENT = 'unsupported_client',
}

// 认证配置
export interface AuthConfig {
  enableApiKeyValidation: boolean;
  maxApiKeyLength: number;
  minApiKeyLength: number;
  enableInputSanitization: boolean;
  allowedOrigins: string[];
  enableCorsProtection: boolean;
}