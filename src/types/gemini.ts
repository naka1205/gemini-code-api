// Gemini API types

export interface GeminiContent {
  parts: Array<{
    text: string;
  }>;
  role?: 'user' | 'model';
}

export interface GeminiRequest {
  contents: GeminiContent[];
  generationConfig?: {
    temperature?: number;
    topK?: number;
    topP?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
    thinkingConfig?: {
      includeThoughts?: boolean;
      thinkingBudget?: number;
    };
  };
  safetySettings?: Array<{
    category: string;
    threshold: string;
  }>;
}

export interface GeminiResponse {
  candidates: Array<{
    content: GeminiContent;
    finishReason: string;
    index: number;
    thought?: string;
    safetyRatings: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
    thoughtsTokenCount?: number;
    thinkingTokenCount?: number;
  };
}

export interface GeminiError {
  error: {
    code: number;
    message: string;
    status: string;
  };
}