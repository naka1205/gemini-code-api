
// src/config/models.config.ts

export const MODEL_MAPPINGS: Record<string, string> = {
  // OpenAI -> Gemini
  'gpt-4': 'gemini-2.5-flash',      // 中级模型
  'gpt-4o': 'gemini-2.5-pro',       // 高级模型
  'gpt-4o-mini': 'gemini-2.5-flash', // 中级模型
  'gpt-4-turbo': 'gemini-2.5-flash', // 中级模型
  'gpt-3.5-turbo': 'gemini-2.0-flash', // 低级模型

  // Claude -> Gemini
  'claude-opus-4-20250514': 'gemini-2.5-pro',      // 高级模型
  'claude-sonnet-4-20250514': 'gemini-2.5-flash',  // 中级模型
  'claude-3-7-sonnet-20250219': 'gemini-2.5-flash', // 中级模型
  'claude-3-5-sonnet-20241022': 'gemini-2.0-flash', // 低级模型
  'claude-3-5-haiku-20241022': 'gemini-2.0-flash',  // 低级模型
  'claude-3-opus-20240229': 'gemini-2.0-flash',     // 低级模型
  'claude-3-sonnet-20240229': 'gemini-2.0-flash',   // 低级模型

  // 嵌入模型
  'text-embedding-ada-002': 'text-embedding-004',
  'text-embedding-3-small': 'text-embedding-004',
  'text-embedding-3-large': 'text-multilingual-embedding-002',
};

// 支持思考的模型
export const THINKING_SUPPORTED_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
] as const;

export const getGeminiModel = (requestedModel: string): string => {
  return MODEL_MAPPINGS[requestedModel] || 'gemini-2.5-flash'; // Default model
};
