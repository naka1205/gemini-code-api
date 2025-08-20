// src/utils/error-handler.ts

export interface ApiError {
  statusCode: number;
  message: string;
  type?: string;
  code?: string;
}

export class ErrorHandler {
  /**
   * Handle authentication errors
   */
  static handleAuthError(message?: string): never {
    const error = new Error(message || 'API key not provided or invalid') as any;
    error.statusCode = 401;
    throw error;
  }

  /**
   * Handle validation errors
   */
  static handleValidationError(message: string): never {
    const error = new Error(message) as any;
    error.statusCode = 400;
    throw error;
  }

  /**
   * Handle rate limiting errors
   */
  static handleRateLimitError(message?: string): never {
    const error = new Error(message || 'Rate limit exceeded') as any;
    error.statusCode = 429;
    throw error;
  }

  /**
   * Handle internal server errors
   */
  static handleInternalError(message?: string): never {
    const error = new Error(message || 'Internal server error') as any;
    error.statusCode = 500;
    throw error;
  }

  /**
   * Transform Gemini API errors to OpenAI format
   */
  static transformGeminiToOpenAIError(geminiError: any): any {
    const message = geminiError.error?.message || geminiError.message || 'Request failed';
    const code = geminiError.error?.code || 'unknown_error';

    return {
      error: {
        message,
        type: 'invalid_request_error',
        code
      }
    };
  }

  /**
   * Transform Gemini API errors to Claude format
   */
  static transformGeminiToClaudeError(geminiError: any): any {
    const message = geminiError.error?.message || geminiError.message || 'Request failed';

    return {
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message
      }
    };
  }

  /**
   * Transform generic errors based on protocol
   */
  static transformError(error: any, protocol: 'openai' | 'claude'): any {
    if (protocol === 'openai') {
      return this.transformGeminiToOpenAIError(error);
    } else {
      return this.transformGeminiToClaudeError(error);
    }
  }

  /**
   * Extract error details from various error formats
   */
  static extractErrorDetails(error: any): ApiError {
    if (error.statusCode && error.statusMessage) {
      return {
        statusCode: error.statusCode,
        message: error.statusMessage,
        type: error.type,
        code: error.code
      };
    }

    if (error.response) {
      return {
        statusCode: error.response.status || 500,
        message: error.response.statusText || error.message || 'Unknown error',
        type: 'api_error'
      };
    }

    return {
      statusCode: 500,
      message: error.message || 'Internal server error',
      type: 'internal_error'
    };
  }

  /**
   * Create a standardized error response
   */
  static createErrorResponse(statusCode: number, message: string, type?: string, code?: string) {
    return {
      error: {
        message,
        type: type || 'api_error',
        code: code || 'unknown_error'
      }
    };
  }
}