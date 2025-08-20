// src/routes/v1/chat/completions.post.ts
import { Hono } from 'hono';
import { OpenAIChatAdapter } from '../../../adapters/openai';
import { AuthService } from '../../../utils/auth';
import { LoggingService } from '../../../utils/logging';
import { IntelligentLoadBalancer } from '../../../utils/load-balancer';

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
    console.log(`OpenAI Chat Completions - Detected client type: ${authResult.clientType}`);
    
    if (!authResult.keys || authResult.keys.length === 0) {
      return c.json({ 
        error: authService.getAuthErrorMessage(authResult.clientType)
      }, 401);
    }
    
    // Use the first valid API key from client request
    const selectedApiKey = authResult.keys[0];
    
    const requestBody = await c.req.json();
    
    // Create OpenAI chat adapter with selected API key
    const chatAdapter = new OpenAIChatAdapter({ apiKey: selectedApiKey });
    
    // Process the request
    const response = await chatAdapter.completions(requestBody);
    const responseTime = Date.now() - startTime;
    
    // Record success metrics (optional - could implement client-specific metrics later)
    // lb.recordSuccess(selectedApiKey, responseTime);
    
    // Extract token information for logging
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    
    if (response.ok) {
      try {
        // For non-streaming responses, extract token info
        if (!requestBody.stream) {
          const responseClone = response.clone();
          const responseData = await responseClone.json() as any;
          if (responseData.usage) {
            inputTokens = responseData.usage.prompt_tokens;
            outputTokens = responseData.usage.completion_tokens;
          }
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
    
    await loggingService.logSuccess(mockEvent as any, selectedApiKey, requestBody.model || 'gpt-3.5-turbo', responseTime, {
      isStream: !!requestBody.stream,
      inputTokens,
      outputTokens,
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
    
    await loggingService.logError(mockEvent as any, 'client-provided', 'unknown', responseTime, {
      statusCode: error.statusCode || 500,
      message: error.message || 'Internal server error'
    });
    
    return c.json({ 
      error: error.message || 'Internal server error' 
    }, error.statusCode || 500);
  }
});

export default app;