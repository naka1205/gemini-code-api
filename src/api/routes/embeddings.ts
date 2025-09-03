import { Hono } from 'hono';
import { Container } from '../../logic/container';
import { OpenAIAdapter } from '../../logic/adapters/openai';
import { TypedContext } from '../../common/types';

export function createEmbeddingsRoute(container: Container): Hono {
  const app = new Hono();

  // Note: The embeddings logic is not fully implemented in the adapter.
  // This route is set up according to the new structure, but will need
  // the adapter's process method to be updated to handle embeddings requests.
  app.post('/', async (c: TypedContext) => {
    const adapter = container.get<OpenAIAdapter>('openaiAdapter');
    const apiKeys = c.get('apiKeys');
    // This call might need adjustment when embeddings logic is fully implemented.
    return await adapter.process(c, apiKeys);
  });

  return app;
}
