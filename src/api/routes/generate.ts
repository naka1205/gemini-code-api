
import { Hono } from 'hono';
import { Container } from '../../logic/container';
import { GeminiAdapter } from '../../logic/adapters/gemini';
import { TypedContext } from '../../common/types';

export function createGenerateRoute(container: Container): Hono {
  const app = new Hono();

  // 使用通配符匹配 Gemini API 的标准格式: /v1beta/models/{model}:generateContent
  app.post('/*', async (c: TypedContext) => {
    const path = c.req.path;
    const isStream = path.includes(':streamGenerateContent');
    const isGenerate = path.includes(':generateContent') || path.includes(':streamGenerateContent');
    
    // Accept both regular and stream generate content endpoints
    if (!isGenerate) {
      return c.json({ error: 'Invalid endpoint' }, 400);
    }
    
    // 从路径中提取模型名称: /v1beta/models/gemini-2.5-flash:generateContent -> gemini-2.5-flash
    const modelMatch = path.match(/\/v1beta\/models\/([^:]+):/);
    if (!modelMatch) {
      return c.json({ error: 'Invalid model path' }, 400);
    }
    
    const modelName = modelMatch[1];
    const adapter = container.get<GeminiAdapter>('geminiAdapter');
    const apiKeys = c.get('apiKeys');
    
    const body = await c.req.json();
    
    // Set model based on path parameter and add it to the body for the transformer
    const requestBody = {
      ...body,
      model: modelName,  // Add the model from the URL path
      // Do not include stream in the request body for Gemini API
    };
    delete requestBody.stream; // Remove if accidentally included
    
    // Re-create a request with the modified body to pass to the adapter
    const newReq = new Request(c.req.url, {
      method: 'POST',
      headers: c.req.header(),
      body: JSON.stringify(requestBody),
    });
    
    // The adapter's process method expects the context `c` to have the request
    // so we create a lightweight mock context for this.
    const mockContext = { 
      ...c, 
      req: { 
        ...c.req,
        raw: newReq
      },
      executionCtx: c.executionCtx,  // Ensure execution context is passed
      // Pass additional info for the adapter
      model: modelName,
      isStream: isStream
    };

    return await adapter.process(mockContext, apiKeys);
  });

  return app;
}
