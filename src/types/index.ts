// Common types for the API service

export interface ApiError {
  error: {
    message: string;
    type: string;
    code?: string;
  };
}

export interface LogData {
  apiKey: string;
  model: string;
  responseTime: number;
  statusCode: number;
  isStream?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
}

export interface RequestLog {
  id: string;
  apiKeyHash: string;
  model: string;
  ipAddress: string;
  statusCode: number;
  requestTimestamp: string;
  responseTimeMs: number;
  isStream: boolean;
  userAgent: string;
  errorMessage?: string;
  requestUrl: string;
  requestModel: string;
  inputTokens?: number;
  outputTokens?: number;
}