// src/routes/v1beta/[...path].post.ts
import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { AuthService } from '../../utils/auth';
import { LoggingService } from '../../utils/logging';
import { IntelligentLoadBalancer } from '../../utils/load-balancer';

// Global load balancer instance for v1beta routes
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
  const balancer = getLoadBalancer(c.env);

  try {
    // Extract API keys from request
    const clientApiKeys = authService.extractApiKeys(c);
    if (!clientApiKeys || clientApiKeys.length === 0) {
      return c.json(
        { error: { message: 'API key not provided.', type: 'authentication_error' } },
        401
      );
    }

    // Use the first valid API key from client request
    const selectedKey = clientApiKeys[0];

    // Get the path from the URL (everything after /v1beta/)
    const url = new URL(c.req.url);
    const pathParam = url.pathname.replace('/v1beta/', '');
    const queryString = url.search;
    const targetUrl = `https://generativelanguage.googleapis.com/v1beta/${pathParam}${queryString}`;

    // Read request body
    const requestBody = await c.req.json().catch(() => ({}));

    // Make request to Gemini API
    const geminiResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': selectedKey,
      },
      body: JSON.stringify(requestBody),
    });

    const contentType = geminiResponse.headers.get('Content-Type') || 'application/json';
    const isStream = contentType.includes('text/event-stream');
    
    // Extract model name from path
    const realModel = pathParam.split('/')[1]?.split(':')[0] || 'unknown';
    
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;

    if (isStream) {
      // Handle streaming response
      return stream(c, async (stream) => {
        const reader = geminiResponse.body?.getReader();
        if (!reader) {
          throw new Error('Failed to get response reader');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        try {
          // Set response headers
          c.header('Content-Type', contentType);
          c.header('Cache-Control', 'no-cache');
          c.header('Connection', 'keep-alive');

          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              // Log successful streaming request
              const responseTime = Date.now() - startTime;
              // balancer.recordSuccess(selectedKey, responseTime);
              
              await loggingService.logSuccess(c, selectedKey, realModel, responseTime, {
                isStream: true,
                inputTokens: inputTokens ?? undefined,
                outputTokens: outputTokens ?? undefined,
                requestModel: realModel,
              });
              
              break;
            }

            // Forward chunk immediately
            await stream.write(value);

            // Accumulate for token extraction
            buffer += decoder.decode(value, { stream: true });

            // Parse for token information
            const lines = buffer.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const jsonStr = line.substring(6).trim();
                  if (jsonStr && jsonStr !== '[DONE]') {
                    const data = JSON.parse(jsonStr);
                    if (data.usageMetadata) {
                      inputTokens = data.usageMetadata.promptTokenCount || null;
                      outputTokens = data.usageMetadata.candidatesTokenCount || null;
                    }
                  }
                } catch {
                  // Ignore JSON parse errors for individual chunks
                }
              }
            }
          }
        } catch (error) {
          const responseTime = Date.now() - startTime;
          // balancer.recordError(selectedKey, responseTime);
          
          await loggingService.logError(c, selectedKey, realModel, responseTime, {
            statusCode: 500,
            message: error instanceof Error ? error.message : 'Stream processing error',
            isStream: true,
            requestModel: realModel,
          });
          
          throw error;
        } finally {
          reader.releaseLock();
        }
      });
    } else {
      // Handle non-streaming response
      const responseText = await geminiResponse.text();
      const responseTime = Date.now() - startTime;

      // Extract token information from response
      try {
        const responseData = JSON.parse(responseText);
        if (responseData.usageMetadata) {
          inputTokens = responseData.usageMetadata.promptTokenCount || null;
          outputTokens = responseData.usageMetadata.candidatesTokenCount || null;
        }
      } catch {
        // Ignore JSON parse errors for response
      }

      if (geminiResponse.ok) {
        // Record success
        // balancer.recordSuccess(selectedKey, responseTime);
        
        await loggingService.logSuccess(c, selectedKey, realModel, responseTime, {
          isStream: false,
          inputTokens: inputTokens ?? undefined,
          outputTokens: outputTokens ?? undefined,
          requestModel: realModel,
        });

        // Return response with original headers
        const response = new Response(responseText, {
          status: geminiResponse.status,
          statusText: geminiResponse.statusText,
          headers: geminiResponse.headers,
        });

        return response;
      } else {
        // Record error
        // balancer.recordError(selectedKey, responseTime);
        
        await loggingService.logError(c, selectedKey, realModel, responseTime, {
          statusCode: geminiResponse.status,
          message: `Gemini API error: ${geminiResponse.statusText}`,
          isStream: false,
          requestModel: realModel,
        });

        return new Response(responseText, {
          status: geminiResponse.status,
          statusText: geminiResponse.statusText,
          headers: geminiResponse.headers,
        });
      }
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Try to record error if we have a selected key
    try {
      await loggingService.logError(c, 'client-provided', 'unknown', responseTime, {
        statusCode: 500,
        message: errorMessage,
      });
    } catch {
      // Ignore logging errors
    }

    return c.json(
      {
        error: {
          message: errorMessage,
          type: 'internal_server_error',
        },
      },
      500
    );
  }
});

export default app;