// src/middleware/logger.ts
import type { Context, Next } from 'hono';

export const loggerMiddleware = async (c: Context, next: Next) => {
  const start = Date.now();
  const method = c.req.method;
  const url = c.req.url;
  const userAgent = c.req.header('user-agent') || '';
  const ip = c.req.header('cf-connecting-ip') || 
             c.req.header('x-forwarded-for') || 
             c.req.header('x-real-ip') || 
             'unknown';

  console.log(`[${new Date().toISOString()}] ${method} ${url} - ${ip} - ${userAgent}`);

  await next();

  const responseTime = Date.now() - start;
  const status = c.res.status;
  
  console.log(`[${new Date().toISOString()}] ${method} ${url} - ${status} - ${responseTime}ms`);
};