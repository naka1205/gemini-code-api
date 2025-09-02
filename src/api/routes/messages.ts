import { Hono } from 'hono';
import { Container } from '../../logic/container';
import { ClaudeAdapter } from '../../logic/adapters/claude';
import { TypedContext } from '../../common/types';

export function createMessagesRoute(container: Container): Hono {
  const app = new Hono();

  app.post('/v1/messages', async (c: TypedContext) => {
    const adapter = container.get<ClaudeAdapter>('claudeAdapter');
    const apiKeys = c.get('apiKeys');
    return await adapter.process(c, apiKeys);
  });

  return app;
}