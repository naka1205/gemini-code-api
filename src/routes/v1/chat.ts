/**
 * V1 聊天完成路由
 * OpenAI /v1/chat/completions API兼容端点
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { detectClientType } from '../../middleware/auth/detector';
import { extractAndValidateApiKeys } from '../../middleware/auth/extractor';
import { throwError } from '../../adapters/base/errors.js';
import { ProductionLogger as Logger } from '../../utils/logger';
import { MODEL_MAPPINGS } from '../../utils/constants';
import { SmartLoadBalancer } from '../../services/balancer/selector.js';
import { hashApiKey } from '../../utils/helpers.js';

/**
 * 创建聊天完成路由
 */
export function createChatCompletionsRoute(): Hono {
  const app = new Hono();

  /**
   * POST /v1/chat/completions
   * OpenAI聊天完成API兼容端点
   */
  app.post('/', async (c: Context) => {
    const logger = new Logger();

    try {
      logger.info('OpenAI chat completions request');

      // 认证
      let detectionResult;
      let authResult;
      
      try {
        logger.debug('Starting client type detection');
        detectionResult = detectClientType(c.req.raw);
        logger.debug('Client type detected', { 
          clientType: detectionResult.clientType, 
          confidence: detectionResult.confidence,
          reason: detectionResult.reason 
        });
        
        logger.debug('Starting API key extraction and validation');
        authResult = extractAndValidateApiKeys(c.req.raw, detectionResult);
        logger.debug('API key validation result', {
          hasValidKeys: authResult.hasValidKeys,
          totalKeys: authResult.extraction.totalKeys,
          validKeysCount: authResult.validation.validKeys.length,
          invalidKeysCount: authResult.validation.invalidKeys.length,
          warnings: authResult.validation.warnings,
          source: authResult.extraction.source
        });
      } catch (error) {
        logger.error('Authentication detection failed', error instanceof Error ? error : new Error(String(error)), {
          errorType: typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        throwError.authentication('Authentication failed. Please provide a valid Gemini API key starting with "AI".');
      }
      
      if (!authResult!.hasValidKeys) {
        const errorMessage = authResult!.validation.warnings.length > 0 
          ? authResult!.validation.warnings[0]
          : authResult!.recommendation || 'Valid Gemini API key required. API key must start with "AI".';
        const expectedFailure = c.req.header('x-test-expected-failure');
        const logPayload = {
          errorMessage,
          warnings: authResult!.validation.warnings,
          recommendation: authResult!.recommendation,
          extraction: authResult!.extraction
        };
        if (expectedFailure) {
          logger.info('Authentication expected-failure (suppressed warn)', logPayload);
        } else {
          logger.warn('Authentication failed - no valid keys', logPayload);
        }
        throwError.authentication(errorMessage);
      }
      
      logger.info('Authentication successful', {
        validKeysCount: authResult!.validation.validKeys.length,
        clientType: detectionResult!.clientType
      });

      // 获取请求体
      const requestBody = await c.req.json().catch(() => ({}));
      logger.info('Request body parsed', { 
        model: requestBody.model, 
        hasMessages: !!requestBody.messages,
        stream: requestBody.stream 
      });

      // 验证必需字段
      if (!requestBody.model || !requestBody.messages || !Array.isArray(requestBody.messages)) {
        throwError.validation('Fields "model" and "messages" are required');
      }

      // 检查是否为流式请求
      const isStreaming = requestBody.stream === true;
      logger.info('Request type', { isStreaming });

      // 验证模型是否支持
      const geminiModel = MODEL_MAPPINGS[requestBody.model as keyof typeof MODEL_MAPPINGS];
      if (!geminiModel) {
        throwError.validation(`Model '${requestBody.model}' is not supported. Please use one of the supported models.`);
      }
      logger.info('Model mapping', { openaiModel: requestBody.model, geminiModel });

      // 使用负载均衡器选择API密钥
      if (!authResult!.validation.validKeys || authResult!.validation.validKeys.length === 0) {
        throwError.authentication('No valid API keys available');
      }
      
      // 初始化负载均衡器
      const kv = c.env.KV as KVNamespace;
      const db = c.env.DB as D1Database;
      const loadBalancer = new SmartLoadBalancer(kv, db);
      
      // 估算token数量
      const estimatedTokens = estimateTokensFromMessages(requestBody.messages);
      
      // 选择最优API密钥
      let selection;
      try {
        selection = await loadBalancer.selectOptimalKey(
          authResult!.validation.validKeys,
          geminiModel,
          estimatedTokens
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('blacklisted')) {
          logger.warn('API key is blacklisted', { errorMessage });
          throwError.authentication('API key is temporarily unavailable. Please try again later or use a different API key.');
        } else {
          logger.error('Load balancer selection failed', error instanceof Error ? error : new Error(String(error)));
          throwError.api('Failed to select API key. Please try again.');
        }
      }
      
      // 确保selection已定义
      if (!selection) {
        throwError.api('Failed to select API key. Please try again.');
      }
      
      logger.info('Load balancer selection', {
        selectedKeyHash: selection!.selectedKeyHash.substring(0, 8) + '...',
        reason: selection!.reason,
        availableKeys: selection!.availableKeys,
        healthyKeys: selection!.healthyKeys,
        model: geminiModel,
        estimatedTokens
      });

      // 转换OpenAI格式的消息到Gemini格式
      const geminiRequest: any = {
        contents: requestBody.messages.map((message: any) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content || '' }]
        })).filter((content: any) => content.parts[0].text) // 过滤空消息
      };
      
      // 设置生成配置
      if (requestBody.max_tokens) {
        geminiRequest.generationConfig = {
          maxOutputTokens: requestBody.max_tokens
        };
      }

      // 如果是流式请求，调用流式处理
      if (isStreaming) {
        const requestSize = new TextEncoder().encode(JSON.stringify(requestBody)).length;
        return await handleStreamingChatCompletion(c, requestBody, geminiModel, geminiRequest, selection!.selectedKey, logger, detectionResult!.clientType, requestSize, loadBalancer);
      }
      
      // 构建Gemini API URL
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${selection!.selectedKey}`;
      
              logger.info('Calling Gemini API', { model: geminiModel, url: geminiUrl.replace(selection!.selectedKey, '***') });

      const start = Date.now();
      // 调用Gemini API
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'gemini-code-api/2.0.0',
        },
        body: JSON.stringify(geminiRequest),
      });

      const responseData = await response.json() as any;

      if (!response.ok) {
        logger.error(`Gemini API error: ${response.status}`, new Error(`API Error: ${responseData.error?.message || 'Unknown error'}`));
        
        // 记录API错误到负载均衡器
        await loadBalancer.handleApiError(selection!.selectedKey, geminiModel, {
          status: response.status,
          message: responseData.error?.message || 'Unknown error'
        });
        
        throwError.api(
          responseData.error?.message || `Gemini API error: ${response.status}`,
          response.status
        );
      }

      logger.info(`Gemini API call successful: ${response.status}`);

      // 转换Gemini响应到OpenAI格式
      const openaiResponse = {
        id: responseData.responseId || 'chatcmpl-' + Date.now(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: requestBody.model,
        choices: responseData.candidates ? responseData.candidates.map((candidate: any, index: number) => ({
          index,
          message: {
            role: 'assistant',
            content: candidate.content?.parts?.[0]?.text || ''
          },
          finish_reason: candidate.finishReason === 'STOP' ? 'stop' : 
                       candidate.finishReason === 'MAX_TOKENS' ? 'length' : 'stop'
        })) : [{
          index: 0,
          message: { role: 'assistant', content: 'Error: No response from Gemini API' },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: responseData.usageMetadata?.promptTokenCount || 0,
          completion_tokens: responseData.usageMetadata?.candidatesTokenCount || 0,
          total_tokens: responseData.usageMetadata?.totalTokenCount || 0
        }
      };

      // 记录使用情况（异步，不阻塞响应）
      try {
        logger.info('Attempting to record usage', {
          model: requestBody.model,
          inputTokens: openaiResponse.usage.prompt_tokens,
          outputTokens: openaiResponse.usage.completion_tokens,
          totalTokens: openaiResponse.usage.total_tokens
        });
        
        const responseSize = new TextEncoder().encode(JSON.stringify(openaiResponse)).length;
        const clientIP = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '';
        const userAgent = c.req.header('user-agent') || '';
        
        c.executionCtx.waitUntil(
          loadBalancer.recordUsage(
            selection!.selectedKey,
            geminiModel,
            openaiResponse.usage.prompt_tokens,
            openaiResponse.usage.completion_tokens,
            {
              originalModel: requestBody.model,
              endpoint: '/v1/chat/completions',
              clientType: detectionResult!.clientType,
              statusCode: 200,
              responseTimeMs: Date.now() - start,
              clientIP,
              userAgent,
              isStream: false,
              requestSize: new TextEncoder().encode(JSON.stringify(requestBody)).length,
              responseSize
            }
          )
        );
        
        logger.info('Usage recording initiated');
      } catch (error) {
        logger.error('Failed to record usage', error instanceof Error ? error : new Error(String(error)));
      }

      // 设置负载均衡器响应头
      const jsonResponse = c.json(openaiResponse);
      jsonResponse.headers.set('x-selection-reason', selection!.reason);
      jsonResponse.headers.set('x-available-keys', selection!.availableKeys.toString());
      jsonResponse.headers.set('x-healthy-keys', selection!.healthyKeys.toString());
      jsonResponse.headers.set('x-selected-key-hash', selection!.selectedKeyHash.substring(0, 8) + '...');
      
      return jsonResponse;

    } catch (error) {
      logger.error('Chat completions error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  });

  /**
   * OPTIONS /v1/chat/completions
   * CORS预检请求处理
   */
  app.options('/', async () => {
    return new Response('', { status: 204 });
  });

  return app;
}

/**
 * 估算消息的token数量
 */
function estimateTokensFromMessages(messages: any[]): number {
  let totalTokens = 0;
  for (const message of messages) {
    if (message.content) {
      // 简单估算：每4个字符约等于1个token
      totalTokens += Math.ceil(message.content.length / 4);
    }
  }
  return totalTokens;
}

/**
 * 处理流式聊天完成请求
 */
async function handleStreamingChatCompletion(
  c: Context, 
  requestBody: any, 
  geminiModel: string, 
  geminiRequest: any, 
  selectedKey: string, 
  logger: any,
  clientType: string,
  requestSize: number,
  loadBalancer: SmartLoadBalancer
): Promise<Response> {
  try {
    // 设置生成配置
    if (requestBody.max_tokens) {
      geminiRequest.generationConfig = {
        maxOutputTokens: requestBody.max_tokens
      };
    }
    
    // 构建Gemini流式API URL
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${selectedKey}`;
    
    logger.info('Calling Gemini streaming API', { model: geminiModel, url: geminiUrl.replace(selectedKey, '***') });

    // 调用Gemini流式API
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'User-Agent': 'gemini-code-api/2.0.0',
      },
      body: JSON.stringify(geminiRequest),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as any;
      logger.error(`Gemini streaming API error: ${response.status}`, new Error(`API Error: ${errorData.error?.message || 'Unknown error'}`));
      
      // 记录API错误到负载均衡器
      await loadBalancer.handleApiError(selectedKey, geminiModel, {
        status: response.status,
        message: errorData.error?.message || 'Unknown error'
      });

      throwError.api(
        errorData.error?.message || `Gemini streaming API error: ${response.status}`,
        response.status
      );
    }

    if (!response.body) {
      throwError.api('No response body for streaming', 502);
    }

    logger.info(`Gemini streaming API call successful: ${response.status}`);

    // 创建OpenAI格式的流式转换器
    const id = `chatcmpl-${Date.now()}`;
    let buffer = "";
    let last: any[] = [];
    const streamIncludeUsage = requestBody.stream_options?.include_usage;
    
    // 添加buffer大小限制，防止内存泄漏
    const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB限制
    const MAX_LAST_ARRAY_SIZE = 100; // 限制last数组大小
    
    const upstream = response.body!;
    // 先 tee：一支做转换输出，一支统计 usage
    const [forTransform, forUsage] = upstream.tee();
    const transformStream = forTransform
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new TransformStream({
        transform(chunk: string, controller) {
          const responseLineRE = /^data: (.*)(?:\n\n|\r\r|\r\n\r\n)/;
          buffer += chunk;
          
          // 检查buffer大小，防止内存泄漏
          if (buffer.length > MAX_BUFFER_SIZE) {
            logger.error("Buffer size exceeded limit, clearing buffer to prevent memory leak", {
              bufferSize: buffer.length,
              maxSize: MAX_BUFFER_SIZE
            });
            buffer = buffer.substring(buffer.length - MAX_BUFFER_SIZE / 2); // 保留后半部分
          }
          
          do {
            const match = buffer.match(responseLineRE);
            if (!match) { break; }
            controller.enqueue(match[1]);
            buffer = buffer.substring(match[0].length);
          } while (true);
        },
        flush(controller) {
          if (buffer) {
            logger.warn("Invalid data in buffer:", {
              bufferLength: buffer.length,
              bufferContent: buffer.substring(0, 200) + (buffer.length > 200 ? "..." : "")
            });
            controller.enqueue(buffer);
          }
          // 清理buffer
          buffer = "";
        }
      }))
      .pipeThrough(new TransformStream({
        transform(line: string, controller) {
          const delimiter = "\n\n";
          const sseline = (obj: any): string => {
            obj.created = Math.floor(Date.now() / 1000);
            return "data: " + JSON.stringify(obj) + delimiter;
          };

          let data: any;
          try {
            data = JSON.parse(line);
            if (!data.candidates) {
              throwError.validation("Invalid completion chunk object");
            }
          } catch (err) {
            logger.error("Error parsing response:", err);
            controller.enqueue(line + delimiter);
            return;
          }

          const obj: any = {
            id: id,
            choices: data.candidates.map((cand: any) => transformCandidatesDelta(cand)),
            model: data.modelVersion ?? requestBody.model,
            object: "chat.completion.chunk",
            usage: data.usageMetadata && streamIncludeUsage ? transformUsage(data.usageMetadata) : undefined,
          };

          const cand = obj.choices[0];
          cand.index = cand.index || 0;
          const finish_reason = cand.finish_reason;
          cand.finish_reason = null;

          if (!last[cand.index]) {
            controller.enqueue(sseline({
              ...obj,
              choices: [{ ...cand, tool_calls: undefined, delta: { role: "assistant", content: "" } }],
            }));
            
            // 限制last数组大小，防止内存泄漏
            if (last.length > MAX_LAST_ARRAY_SIZE) {
              logger.warn("Last array size exceeded limit, clearing old entries", {
                arraySize: last.length,
                maxSize: MAX_LAST_ARRAY_SIZE
              });
              last = last.slice(-MAX_LAST_ARRAY_SIZE / 2); // 保留后半部分
            }
          }

          delete cand.delta.role;
          if ("content" in cand.delta) {
            controller.enqueue(sseline(obj));
          }

          cand.finish_reason = finish_reason;
          if (data.usageMetadata && streamIncludeUsage) {
            obj.usage = transformUsage(data.usageMetadata);
          }

          cand.delta = {};
          last[cand.index] = obj;
        },
        flush(controller) {
          const delimiter = "\n\n";
          const sseline = (obj: any): string => {
            obj.created = Math.floor(Date.now() / 1000);
            return "data: " + JSON.stringify(obj) + delimiter;
          };

          if (last.length > 0) {
            for (const obj of last) {
              controller.enqueue(sseline(obj));
            }
            controller.enqueue("data: [DONE]" + delimiter);
          }
          // 清理last数组和buffer，防止内存泄漏
          last = [];
          buffer = "";
        }
      }))
      .pipeThrough(new TextEncoderStream());

    // 统计 usage 与下游输出大小
    let promptTokens = 0;
    let completionTokens = 0;
    let responseBytes = 0;

    const usagePromise = (async () => {
      const dec = new TextDecoder();
      let buf = '';
      const reader = forUsage.getReader();
      const MAX_USAGE_BUFFER_SIZE = 1024 * 1024; // 1MB限制
      
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            buf += dec.decode(value, { stream: true });
            
            // 检查usage buffer大小，防止内存泄漏
            if (buf.length > MAX_USAGE_BUFFER_SIZE) {
              logger.warn("Usage buffer size exceeded limit, clearing buffer", {
                bufferSize: buf.length,
                maxSize: MAX_USAGE_BUFFER_SIZE
              });
              buf = buf.substring(buf.length - MAX_USAGE_BUFFER_SIZE / 2); // 保留后半部分
            }
            
            let idx;
            while ((idx = buf.indexOf('\n')) !== -1) {
              const line = buf.slice(0, idx);
              buf = buf.slice(idx + 1);
              const t = line.trim();
              if (!t.startsWith('data: ')) continue;
              const data = t.slice(6).trim();
              if (!data || data === '[DONE]') continue;
              try {
                const obj = JSON.parse(data);
                const um = obj?.usageMetadata;
                if (um) {
                  if (typeof um.promptTokenCount === 'number') promptTokens = um.promptTokenCount;
                  if (typeof um.candidatesTokenCount === 'number') completionTokens = um.candidatesTokenCount;
                }
              } catch {}
            }
          }
        }
      } finally {
        // 清理usage buffer
        buf = "";
      }
    })();

    const [clientStream, countingStream] = transformStream.tee();
    const countPromise = (async () => {
      const reader = countingStream.getReader();
      const MAX_RESPONSE_BYTES = 100 * 1024 * 1024; // 100MB限制
      
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            responseBytes += value.byteLength;
            
            // 检查响应字节数，防止溢出
            if (responseBytes > MAX_RESPONSE_BYTES) {
              logger.warn("Response bytes exceeded limit", {
                responseBytes,
                maxBytes: MAX_RESPONSE_BYTES
              });
              responseBytes = MAX_RESPONSE_BYTES; // 限制最大值
            }
          }
        }
      } finally {
        // 确保reader被正确释放
        reader.releaseLock();
      }
    })();

    // 后台写 usage
    try {
      const clientIP = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '';
      const userAgent = c.req.header('user-agent') || '';
      
      const writePromise = (async () => {
        await Promise.all([usagePromise, countPromise]);
        await loadBalancer.recordUsage(
          selectedKey,
          geminiModel,
          promptTokens,
          completionTokens,
          {
            originalModel: requestBody.model,
            endpoint: '/v1/chat/completions',
            clientType,
            statusCode: 200,
            responseTimeMs: 0,
            clientIP,
            userAgent,
            isStream: true,
            requestSize: requestSize || 0,
            responseSize: responseBytes,
          }
        );
      })();
      c.executionCtx?.waitUntil(writePromise);
    } catch (error) {
      logger.error('Failed to record usage', error instanceof Error ? error : new Error(String(error)));
    }

    // 设置流式响应头
    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    c.header('x-powered-by', 'gemini-code-api');
    
    // 设置负载均衡器响应头（流式响应中无法获取完整selection信息）
    c.header('x-selected-key-hash', hashApiKey(selectedKey).substring(0, 8) + '...');

    // 返回流式响应
    return new Response(clientStream, {
      status: 200,
      headers: c.res.headers,
    });
  } catch (error) {
    logger.error('Streaming chat completions error', error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

/**
 * 转换Gemini候选项为OpenAI格式的delta
 */
function transformCandidatesDelta(candidate: any): any {
  const content = candidate.content?.parts?.[0]?.text || '';
  const finishReason = candidate.finishReason;
  
  return {
    index: 0,
    delta: {
      content: content
    },
    finish_reason: finishReason === 'STOP' ? 'stop' : 
                  finishReason === 'MAX_TOKENS' ? 'length' : null
  };
}

/**
 * 转换Gemini使用统计为OpenAI格式
 */
function transformUsage(usageMetadata: any): any {
  return {
    prompt_tokens: usageMetadata.promptTokenCount || 0,
    completion_tokens: usageMetadata.candidatesTokenCount || 0,
    total_tokens: usageMetadata.totalTokenCount || 0
  };
}