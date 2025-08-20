// src/middleware/cors.ts
import type { Context, Next } from 'hono';

export const corsMiddleware = async (c: Context, next: Next) => {
  // Set CORS headers for all requests
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-goog-api-key, x-api-key, anthropic-version');
  c.header('Access-Control-Max-Age', '86400');

  // Handle preflight OPTIONS requests
  if (c.req.method === 'OPTIONS') {
    return c.text('', 204);
  }

  await next();
};