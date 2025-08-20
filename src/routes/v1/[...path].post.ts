// src/routes/v1/[...path].post.ts
import { Hono } from 'hono';
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

app.post('/*', async (c) => {
  const startTime = Date.now();
  const authService = new AuthService();
  const loggingService = new LoggingService();
  const originalPath = c.req.param() || '';
  
  try {
    // Extract and validate API keys from client with client type detection
    const authResult = await authService.authenticateRequest(c);
    
    // Log detected client type for debugging
    console.log(`Gemini Native API - Detected client type: ${authResult.clientType}`);
    
    if (!authResult.keys || authResult.keys.length === 0) {
      return c.json({ 
        error: authService['getAuthErrorMessage'](authResult.clientType)
      }, 401);
    }
    
    // Use intelligent load balancing to select the best API key
    const lb = getLoadBalancer(c.env);
    const selectedApiKey = lb.selectApiKey();
    if (!selectedApiKey) {
      return c.json({ 
        error: 'No healthy API keys available' 
      }, 503);
    }
    
    const requestBody = await c.req.json();
    
    // Parse the model and stream information from the path
    const pathStr = String(originalPath);
    const modelFromPath = pathStr.split('/')[1]?.split(':')[0] || 'gemini-pro';
    const isStream = pathStr.includes('stream');
    
    // Build target URL for native Gemini API
    const url = new URL(c.req.url);
    const search = url.search;
    const targetUrl = `https://generativelanguage.googleapis.com/v1beta/${pathStr}${search}`;
    
    // Make request to Gemini API
    const geminiResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'x-goog-api-key': selectedApiKey 
      },
      body: JSON.stringify(requestBody),
    });
    
    const responseTime = Date.now() - startTime;
    
    // Handle errors from Gemini
    if (!geminiResponse.ok) {
      // Record error metrics (optional)
      // lb.recordError(selectedApiKey, responseTime);
      
      const errorBody = await geminiResponse.text();
      let errorResponse;
      
      try {
        const geminiError = JSON.parse(errorBody);
        errorResponse = geminiError;
      } catch {
        // Fallback for non-JSON errors
        errorResponse = { error: { message: errorBody || 'Request failed' } };
      }
      
      // Log failed request (mock event for compatibility)
      const mockEvent = {
        node: { req: { url: c.req.url } },
        context: { cloudflare: { env: c.env } }
      };
      
      await loggingService.logError(mockEvent as any, selectedApiKey, modelFromPath, responseTime, {
        statusCode: geminiResponse.status,
        message: errorResponse.error?.message || 'Request failed',
        isStream,
        requestModel: modelFromPath
      });
      
      return c.json(errorResponse, geminiResponse.status);
    }
    
    // Record success metrics (optional)
    // lb.recordSuccess(selectedApiKey, responseTime);
    
    // Handle successful responses
    if (isStream) {
      // Handle streaming response
      const mockEvent = {
        node: { req: { url: c.req.url } },
        context: { cloudflare: { env: c.env } }
      };
      
      // Log streaming request (fire-and-forget)
      loggingService.logSuccess(mockEvent as any, selectedApiKey, modelFromPath, responseTime, {
        isStream: true,
        requestModel: modelFromPath
      }).catch(error => {
        console.warn('Failed to log streaming request:', error.message);
      });
      
      return new Response(geminiResponse.body, { 
        status: 200, 
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
        }
      });
    } else {
      // Handle non-streaming response
      const geminiBody = await geminiResponse.json() as any;
      
      // Extract token information for logging
      let inputTokens: number | undefined;
      let outputTokens: number | undefined;
      
      try {
        if (geminiBody && geminiBody.usageMetadata) {
          inputTokens = geminiBody.usageMetadata.promptTokenCount || undefined;
          outputTokens = geminiBody.usageMetadata.candidatesTokenCount || undefined;
        }
      } catch (e) {
        // Ignore token extraction errors
        console.warn('Failed to extract token usage:', e);
      }
      
      // Log successful request (mock event for compatibility)
      const mockEvent = {
        node: { req: { url: c.req.url } },
        context: { cloudflare: { env: c.env } }
      };
      
      await loggingService.logSuccess(mockEvent as any, selectedApiKey, modelFromPath, responseTime, {
        isStream: false,
        inputTokens,
        outputTokens,
        requestModel: modelFromPath
      });
      
      return c.json(geminiBody);
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