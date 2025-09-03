// src/transformers/error.ts
export interface GeminiError {
  code?: string;
  message: string;
  status?: string;
  details?: any;
}

export class ErrorTransformer {
  /**
   * Transform error to OpenAI format
   */
  static transformToOpenAI(error: GeminiError, _model?: string): any {
    const errorType = this.mapToOpenAIErrorType(error.code);
    const errorCode = this.mapToOpenAIErrorCode(error.code);
    
    return {
      error: {
        message: error.message || 'An unexpected error occurred',
        type: errorType,
        code: errorCode,
        param: null,
      }
    };
  }

  /**
   * Transform error to Claude format
   */
  static transformToClaude(error: GeminiError): any {
    const errorType = this.mapToClaudeErrorType(error.code);
    
    return {
      type: "error",
      error: {
        type: errorType,
        message: error.message || 'An unexpected error occurred'
      }
    };
  }

  /**
   * Transform error to Gemini format (passthrough)
   */
  static transformToGemini(error: GeminiError): any {
    return {
      error: {
        code: error.code || 'UNKNOWN',
        message: error.message,
        status: error.status || 'FAILED_PRECONDITION',
        details: error.details
      }
    };
  }

  /**
   * Parse Gemini error response
   */
  static parseGeminiError(response: any): GeminiError {
    if (response.error) {
      return {
        code: response.error.code?.toString() || 'UNKNOWN',
        message: response.error.message || 'Unknown error occurred',
        status: response.error.status,
        details: response.error.details
      };
    }
    
    // Handle HTTP status errors
    if (response.status && response.statusText) {
      return {
        code: response.status.toString(),
        message: `HTTP ${response.status}: ${response.statusText}`,
        status: 'HTTP_ERROR'
      };
    }
    
    return {
      code: 'UNKNOWN',
      message: 'An unexpected error occurred'
    };
  }

  /**
   * Map Gemini error codes to OpenAI error types
   */
  private static mapToOpenAIErrorType(code?: string): string {
    const codeMap: Record<string, string> = {
      '400': 'invalid_request_error',
      '401': 'authentication_error', 
      '403': 'permission_error',
      '404': 'invalid_request_error',
      '429': 'rate_limit_error',
      '500': 'api_error',
      '503': 'api_error',
      'INVALID_ARGUMENT': 'invalid_request_error',
      'UNAUTHENTICATED': 'authentication_error',
      'PERMISSION_DENIED': 'permission_error',
      'NOT_FOUND': 'invalid_request_error',
      'RESOURCE_EXHAUSTED': 'rate_limit_error',
      'INTERNAL': 'api_error',
      'UNAVAILABLE': 'api_error',
      'DEADLINE_EXCEEDED': 'timeout_error'
    };
    
    return codeMap[code || ''] || 'api_error';
  }

  /**
   * Map Gemini error codes to OpenAI error codes
   */
  private static mapToOpenAIErrorCode(code?: string): string | null {
    const codeMap: Record<string, string> = {
      '429': 'rate_limit_exceeded',
      'RESOURCE_EXHAUSTED': 'rate_limit_exceeded',
      '401': 'invalid_api_key',
      'UNAUTHENTICATED': 'invalid_api_key',
      '400': 'invalid_request',
      'INVALID_ARGUMENT': 'invalid_request'
    };
    
    return codeMap[code || ''] || null;
  }

  /**
   * Map Gemini error codes to Claude error types
   */
  private static mapToClaudeErrorType(code?: string): string {
    const codeMap: Record<string, string> = {
      '400': 'invalid_request_error',
      '401': 'authentication_error',
      '403': 'permission_error', 
      '404': 'not_found_error',
      '429': 'rate_limit_error',
      '500': 'api_error',
      '503': 'overloaded_error',
      'INVALID_ARGUMENT': 'invalid_request_error',
      'UNAUTHENTICATED': 'authentication_error',
      'PERMISSION_DENIED': 'permission_error',
      'NOT_FOUND': 'not_found_error',
      'RESOURCE_EXHAUSTED': 'rate_limit_error',
      'INTERNAL': 'api_error',
      'UNAVAILABLE': 'overloaded_error',
      'DEADLINE_EXCEEDED': 'timeout_error'
    };
    
    return codeMap[code || ''] || 'api_error';
  }

  /**
   * Create a standardized error response
   */
  static createErrorResponse(error: GeminiError, format: 'openai' | 'claude' | 'gemini', model?: string): Response {
    let errorData: any;
    
    switch (format) {
      case 'openai':
        errorData = this.transformToOpenAI(error, model);
        break;
      case 'claude':
        errorData = this.transformToClaude(error);
        break;
      case 'gemini':
        errorData = this.transformToGemini(error);
        break;
      default:
        errorData = { error: { message: error.message } };
    }
    
    const statusCode = this.getHttpStatusCode(error.code);
    
    return new Response(JSON.stringify(errorData), {
      status: statusCode,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Get appropriate HTTP status code from error code
   */
  private static getHttpStatusCode(code?: string): number {
    const codeMap: Record<string, number> = {
      '400': 400,
      '401': 401,
      '403': 403,
      '404': 404,
      '429': 429,
      '500': 500,
      '503': 503,
      'INVALID_ARGUMENT': 400,
      'UNAUTHENTICATED': 401,
      'PERMISSION_DENIED': 403,
      'NOT_FOUND': 404,
      'RESOURCE_EXHAUSTED': 429,
      'INTERNAL': 500,
      'UNAVAILABLE': 503,
      'DEADLINE_EXCEEDED': 408
    };
    
    return codeMap[code || ''] || 500;
  }
}