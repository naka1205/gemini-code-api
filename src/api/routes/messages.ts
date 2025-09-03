import { Hono } from 'hono';
import { Container } from '../../logic/container';
import { ClaudeAdapter } from '../../logic/adapters/claude';
import { TypedContext } from '../../common/types';

export function createMessagesRoute(container: Container): Hono {
  const app = new Hono();

  app.post('/', async (c: TypedContext) => {
    const adapter = container.get<ClaudeAdapter>('claudeAdapter');
    const apiKeys = c.get('apiKeys');
    return await adapter.process(c, apiKeys);
  });

  // 添加OPTIONS方法支持CORS预检请求
  app.options('/', async () => {
    return new Response('', { status: 204 });
  });

  return app;
}