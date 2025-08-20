// src/utils/auth.ts
import type { Context } from 'hono';

export type ClientType = 'openai' | 'claude' | 'gemini' | 'unknown';

export interface AuthResult {
  keys: string[];
  clientType: ClientType;
  isValid: boolean;
}

export class AuthService {
  extractApiKeys(c: Context): string[] {
    const authHeader = c.req.header('Authorization');
    const googHeader = c.req.header('x-goog-api-key');
    const claudeHeader = c.req.header('x-api-key');
    // For Gemini native API (?key=...)
    let keyParam: string | null = null;
    try {
      const url = new URL(c.req.url);
      keyParam = url.searchParams.get('key');
    } catch {}

    let keys: string[] = [];

    if (authHeader && authHeader.startsWith('Bearer ')) {
      keys = authHeader.substring(7).split(',').map(k => k.trim()).filter(Boolean);
    } else if (claudeHeader) {
      keys = claudeHeader.split(',').map(k => k.trim()).filter(Boolean);
    } else if (googHeader) {
      keys = googHeader.split(',').map(k => k.trim()).filter(Boolean);
    } else if (keyParam) {
      keys = [keyParam];
    }

    return keys;
  }

  detectClientType(c: Context): ClientType {
    const userAgent = c.req.header('user-agent') || '';
    const anthropicVersion = c.req.header('anthropic-version');
    const authHeader = c.req.header('Authorization');
    const googHeader = c.req.header('x-goog-api-key');

    // Claude client detection
    if (anthropicVersion || userAgent.toLowerCase().includes('claude')) {
      return 'claude';
    }

    // OpenAI client detection
    if (userAgent.toLowerCase().includes('openai') || 
        authHeader?.startsWith('Bearer sk-')) {
      return 'openai';
    }

    // Gemini client detection
    if (googHeader || userAgent.toLowerCase().includes('gemini')) {
      return 'gemini';
    }

    return 'unknown';
  }

  async authenticateRequest(c: Context): Promise<AuthResult> {
    const keys = this.extractApiKeys(c);
    const clientType = this.detectClientType(c);
    const isValid = this.validateApiKeys(keys);

    return {
      keys,
      clientType,
      isValid
    };
  }

  getAuthErrorMessage(clientType: ClientType): any {
    const baseMessage = 'API key not provided or invalid.';
    
    switch (clientType) {
      case 'openai':
        return {
          error: {
            message: `${baseMessage} Please include it in the Authorization header (e.g., 'Bearer YOUR_API_KEY').`,
            type: 'invalid_request_error',
            code: 'invalid_api_key'
          }
        };
      case 'claude':
        return {
          type: 'error',
          error: {
            type: 'authentication_error',
            message: `${baseMessage} Please include it in the Authorization header (e.g., 'Bearer YOUR_API_KEY').`
          }
        };
      case 'gemini':
        return {
          error: {
            code: 401,
            message: `${baseMessage} Please include it in the 'x-goog-api-key' header.`,
            status: 'UNAUTHENTICATED'
          }
        };
      default:
        return {
          error: `${baseMessage} Please include it in the Authorization header (e.g., 'Bearer YOUR_API_KEY') or 'x-goog-api-key' header.`
        };
    }
  }

  validateApiKey(apiKey: string): boolean {
    // Basic validation - check if it's not empty and has reasonable length
    return Boolean(apiKey && apiKey.length > 10);
  }

  validateApiKeys(keys: string[]): boolean {
    return keys.length > 0 && keys.every(key => this.validateApiKey(key));
  }

  getClientIP(c: Context): string {
    const cfConnectingIP = c.req.header('cf-connecting-ip');
    if (cfConnectingIP) {
      return cfConnectingIP;
    }

    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }

    const realIP = c.req.header('x-real-ip');
    if (realIP) {
      return realIP;
    }

    return 'unknown';
  }
}