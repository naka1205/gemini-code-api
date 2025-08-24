/**
 * V1 聊天完成路由
 * OpenAI /v1/chat/completions API兼容端点
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { detectClientType } from '../../middleware/auth/detector';
import { extractAndValidateApiKeys } from '../../middleware/auth/extractor';
import { throwError } from '../../middleware/error-handler';
import { ProductionLogger as Logger } from '../../utils/logger';
import { MODEL_MAPPINGS } from '../../utils/constants';

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
        logger.warn('Authentication failed - no valid keys', {
          errorMessage,
          warnings: authResult!.validation.warnings,
          recommendation: authResult!.recommendation,
          extraction: authResult!.extraction
        });
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

      // 映射OpenAI模型到Gemini模型
      const geminiModel = MODEL_MAPPINGS[requestBody.model as keyof typeof MODEL_MAPPINGS] || 'gemini-2.5-flash';
      logger.info('Model mapping', { openaiModel: requestBody.model, geminiModel });

      // 选择API密钥 - 确保安全访问
      if (!authResult!.validation.validKeys || authResult!.validation.validKeys.length === 0) {
        throwError.authentication('No valid API keys available');
      }
      
      const selectedKey = authResult!.validation.validKeys[0];
      if (!selectedKey) {
        throwError.authentication('Selected API key is invalid');
      }

      // 转换OpenAI格式的消息到Gemini格式
      const geminiRequest = {
        contents: requestBody.messages.map((message: any) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content || '' }]
        })).filter((content: any) => content.parts[0].text) // 过滤空消息
      };

      // 如果是流式请求，调用流式处理
      if (isStreaming) {
        return await handleStreamingChatCompletion(c, requestBody, geminiModel, geminiRequest, selectedKey, logger);
      }
      
      // 构建Gemini API URL
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${selectedKey}`;
      
      logger.info('Calling Gemini API', { model: geminiModel, url: geminiUrl.replace(selectedKey, '***') });

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

      // 设置响应头
      c.header('Content-Type', 'application/json');
      c.header('x-powered-by', 'gemini-code-api');

      return c.json(openaiResponse, 200);
    } catch (error) {
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
 * 处理流式聊天完成请求
 */
async function handleStreamingChatCompletion(
  c: Context, 
  requestBody: any, 
  geminiModel: string, 
  geminiRequest: any, 
  selectedKey: string, 
  logger: any
): Promise<Response> {
  try {
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
    
    const transformStream = response.body!
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new TransformStream({
        transform(chunk: string, controller) {
          const responseLineRE = /^data: (.*)(?:\n\n|\r\r|\r\n\r\n)/;
          buffer += chunk;
          do {
            const match = buffer.match(responseLineRE);
            if (!match) { break; }
            controller.enqueue(match[1]);
            buffer = buffer.substring(match[0].length);
          } while (true);
        },
        flush(controller) {
          if (buffer) {
            logger.warn("Invalid data:", buffer);
            controller.enqueue(buffer);
          }
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
              throw new Error("Invalid completion chunk object");
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
        }
      }))
      .pipeThrough(new TextEncoderStream());

    // 设置流式响应头
    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    c.header('x-powered-by', 'gemini-code-api');

    // 返回流式响应
    return new Response(transformStream, {
      status: 200,
      headers: c.res.headers,
    });
  } catch (error) {
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