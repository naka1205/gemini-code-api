import { Hono } from 'hono';
import { Container } from '../../logic/container';
import { OpenAIAdapter } from '../../logic/adapters/openai';
import { TypedContext } from '../../common/types';

export function createChatRoute(container: Container): Hono {
  const app = new Hono();

  app.post('/v1/chat/completions', async (c: TypedContext) => {
    const adapter = container.get<OpenAIAdapter>('openaiAdapter');
    const apiKeys = c.get('apiKeys');
    return await adapter.process(c, apiKeys);
  });

  return app;
}