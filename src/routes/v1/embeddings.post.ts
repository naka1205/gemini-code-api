// src/routes/v1/embeddings.post.ts
import { Hono } from 'hono';
import { OpenAIEmbeddingsAdapter } from '../../adapters/openai';
import { AuthService } from '../../utils/auth';
import { LoggingService } from '../../utils/logging';
import { IntelligentLoadBalancer } from '../../utils/load-balancer';

// Load balancer instance - initialized per request
let loadBalancer: IntelligentLoadBalancer | null = null;

function getLoadBalancer(env: any): IntelligentLoadBalancer {
  if (!loadBalancer) {
    const apiKeys = env.GEMINI_API_KEYS?.split(',').filter(Boolean) || [];
    loadBalancer = new IntelligentLoadBalancer(apiKeys);
  }
  return loadBalancer;
}

const app = new Hono();

app.post('/', async (c) => {
  const startTime = Date.now();
  const authService = new AuthService();
  const loggingService = new LoggingService();
  
  try {
    // Extract and validate API keys from client with client type detection
    const authResult = await authService.authenticateRequest(c);
    
    // Log detected client type for debugging
    console.log(`OpenAI Embeddings - Detected client type: ${authResult.clientType}`);
    
    if (!authResult.keys || authResult.keys.length === 0) {
      return c.json({ 
        error: authService.getAuthErrorMessage(authResult.clientType)
      }, 401);
    }
    
    // Use the first valid API key from client request
    const selectedApiKey = authResult.keys[0];
    
    const requestBody = await c.req.json();
    
    // Create OpenAI embeddings adapter with selected API key
    const embeddingsAdapter = new OpenAIEmbeddingsAdapter({ apiKey: selectedApiKey });
    
    // Process the request
    const response = await embeddingsAdapter.create(requestBody);
    const responseTime = Date.now() - startTime;
    
    // Record success metrics (optional)
    // lb.recordSuccess(selectedApiKey, responseTime);
    
    // Extract token information for logging
    let inputTokens: number | undefined;
    
    if (response.ok) {
      try {
        const responseClone = response.clone();
        const responseData = await responseClone.json() as any;
        if (responseData.usage) {
          inputTokens = responseData.usage.prompt_tokens || responseData.usage.total_tokens;
        }
      } catch (e) {
        // Ignore token extraction errors
      }
    }
    
    // Log successful request (mock event for compatibility)
    const mockEvent = {
      node: { req: { url: c.req.url } },
      context: { cloudflare: { env: c.env } }
    };
    
    await loggingService.logSuccess(mockEvent as any, selectedApiKey, requestBody.model || 'text-embedding-ada-002', responseTime, {
      isStream: false,
      inputTokens,
      requestModel: requestBody.model
    });
    
    // Return the response
    if (response.body) {
      return new Response(response.body, {
        status: response.status,
        headers: response.headers
      });
    } else {
      return c.json(await response.json(), response.status);
    }
    
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    
    // Log failed request
    const mockEvent = {
      node: { req: { url: c.req.url } },
      context: { cloudflare: { env: c.env } }
    };
    
    await loggingService.logError(mockEvent as any, 'client-provided', 'text-embedding-ada-002', responseTime, {
      statusCode: error.statusCode || 500,
      message: error.message || 'Internal server error'
    });
    
    return c.json({ 
      error: error.message || 'Internal server error' 
    }, error.statusCode || 500);
  }
});

export default app;