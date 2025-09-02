// src/api/routes/health.ts
import { Hono } from 'hono';
import { Container } from '../../logic/container';
import { APP_INFO } from '../../common/constants';

export function createHealthRoute(_container: Container): Hono {
  const app = new Hono();

  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: APP_INFO.NAME,
      version: APP_INFO.VERSION,
      description: APP_INFO.DESCRIPTION
    });
  });

  return app;
}
