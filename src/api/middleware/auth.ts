
// src/api/middleware/auth.ts
import { TypedContext } from '../../common/types';
import { AuthenticationError } from '../../common/errors';

export function authMiddleware() {
  return async (c: TypedContext, next: () => Promise<void>) => {
    // Support multiple auth header formats
    let apiKey = c.req.header('authorization');
    
    // Remove Bearer prefix if present
    if (apiKey?.startsWith('Bearer ')) {
      apiKey = apiKey.substring(7);
    }
    
    // If no Authorization header, try x-goog-api-key (Gemini format)
    if (!apiKey) {
      apiKey = c.req.header('x-goog-api-key');
    }
    
    // If still no key, try x-api-key (Claude format)  
    if (!apiKey) {
      apiKey = c.req.header('x-api-key');
    }

    if (!apiKey) {
      throw new AuthenticationError('API key is missing. Provide Authorization header, x-goog-api-key, or x-api-key header');
    }

    // In a real app, you'd validate the key format/prefix here
    
    c.set('apiKeys', apiKey.split(',').map((k: string) => k.trim()));
    await next();
  };
}
