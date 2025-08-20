// src/routes/v1/messages.post.ts
import { Hono } from 'hono';
import { ClaudeMessagesAdapter } from '../../adapters/claude';
import { ClaudeStreamingAdapter } from '../../adapters/claude/streaming';
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
    // Validate Claude API authentication
    const authResult = await authService.authenticateRequest(c);
    
    // Log detected client type for debugging
    console.log(`Claude Messages - Detected client type: ${authResult.clientType}`);
    
    if (!authResult.keys || authResult.keys.length === 0) {
      return c.json({ 
        type: 'error',
        error: authService.getAuthErrorMessage(authResult.clientType)
      }, 401);
    }
    
    // Use the first valid API key from client request
    const selectedApiKey = authResult.keys[0];
    
    const requestBody = await c.req.json();
    
    // Create appropriate Claude adapter based on stream parameter
    let response: Response;
    if (requestBody.stream) {
      const claudeStreamAdapter = new ClaudeStreamingAdapter({ apiKey: selectedApiKey });
      response = await claudeStreamAdapter.createStream(requestBody);
    } else {
      const claudeAdapter = new ClaudeMessagesAdapter({ apiKey: selectedApiKey });
      response = await claudeAdapter.create(requestBody);
    }
    const responseTime = Date.now() - startTime;
    
    // Record success metrics (optional)
    // lb.recordSuccess(selectedApiKey, responseTime);
    
    // Extract token information for logging
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    
    if (response.ok) {
      try {
        // For non-streaming responses, extract token info from JSON body
        if (!requestBody.stream) {
          const responseClone = response.clone();
          const responseData = await responseClone.json() as any;
          if (responseData.usage) {
            inputTokens = responseData.usage.input_tokens;
            outputTokens = responseData.usage.output_tokens;
          }
        } else {
          // For streaming responses, try to read usage from headers if available (custom)
          const out = response.headers.get('x-output-tokens');
          const inp = response.headers.get('x-input-tokens');
          if (out) outputTokens = Number(out);
          if (inp) inputTokens = Number(inp);
        }
      } catch (e) {
        // Ignore token extraction errors
      }
    }
    
    // 为客户端附加用时响应头，便于显示“思考用时”
    try {
      const newHeaders = new Headers(response.headers);
      newHeaders.set('x-response-time-ms', String(responseTime));
      // 透传Anthropic版本头，确保客户端兼容
      if (!newHeaders.has('anthropic-version')) newHeaders.set('anthropic-version', '2023-06-01');
      response = new Response(response.body, { status: response.status, headers: newHeaders });
    } catch {}

    // Log successful request (mock event for compatibility)
    const mockEvent = {
      node: { req: { url: c.req.url } },
      context: { cloudflare: { env: c.env } }
    };
    
    await loggingService.logSuccess(mockEvent as any, selectedApiKey, requestBody.model || 'claude-3-sonnet-20240229', responseTime, {
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
    
    // Return Claude-style error response
    return c.json({ 
      type: 'error',
      error: {
        type: 'api_error',
        message: error.message || 'Internal server error'
      }
    }, error.statusCode || 500);
  }
});

export default app;