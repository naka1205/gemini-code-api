/**
 * V1 消息路由
 * Claude /v1/messages API兼容端点
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { detectClientType } from '../../middleware/auth/detector';
import { extractAndValidateApiKeys } from '../../middleware/auth/extractor';
import { throwError } from '../../middleware/error-handler';
import { ProductionLogger as Logger } from '../../utils/logger';
import { MODEL_MAPPINGS } from '../../utils/constants';

/**
 * 生成UUID
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * 创建Claude流式转换器
 */
function createClaudeStreamTransformer(
  model: string,
  options?: { emitPrelude?: boolean }
): TransformStream<Uint8Array, Uint8Array> {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const MESSAGE_ID = `msg_${generateUUID()}`;
  let contentBlockOpen = false;
  let contentBlockIndex = 0;
  let currentBlockType: 'thinking' | 'text' | 'tool_use' | null = null;
  let totalOutput = 0;
  let firstTokenAt = 0;
  let lineBuffer = '';
  // 思考内容处理状态
  let thinkingStarted = false;
  let textStarted = false;
  let lastThinkingText = '';
  const partThinkingBuffers: Record<number, string> = {};
  const pendingTextChunks: string[] = [];

  return new TransformStream<Uint8Array, Uint8Array>({
    start(controller) {
      const emitPrelude = options?.emitPrelude !== false;
      if (emitPrelude) {
        const startEvt = { 
          type: 'message_start', 
          message: { 
            id: MESSAGE_ID, 
            type: 'message', 
            role: 'assistant', 
            content: [], 
            model, 
            stop_reason: null, 
            stop_sequence: null, 
            usage: { input_tokens: 0, output_tokens: 0 } 
          } 
        };
        controller.enqueue(enc.encode(`event: message_start\n`));
        controller.enqueue(enc.encode(`data: ${JSON.stringify(startEvt)}\n\n`));
        controller.enqueue(enc.encode(`event: ping\n`));
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'ping' })}\n\n`));
        }
    },
    
    transform(chunk, controller) {
      // 缓冲跨块的行以避免在边界处截断JSON
      lineBuffer += dec.decode(chunk, { stream: true });
      let nlIndex;
      while ((nlIndex = lineBuffer.indexOf('\n')) !== -1) {
        const line = lineBuffer.slice(0, nlIndex);
        lineBuffer = lineBuffer.slice(nlIndex + 1);
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6).trim();
        if (!data) continue;
        if (data === '[DONE]') {
          continue;
        }
        try {
          const obj = JSON.parse(data);
          if (obj?.usageMetadata?.candidatesTokenCount != null) totalOutput = obj.usageMetadata.candidatesTokenCount;
          const cand = Array.isArray(obj?.candidates) ? obj.candidates[0] : undefined;
          const parts = cand?.content?.parts || [];
          
          // 处理候选级思考内容
          const candThought: string | undefined = (cand as any)?.thought || (cand as any)?.thinking || (cand as any)?.internalThought;
          const hasAnyPlainText = parts?.some((p:any)=>p?.text && p?.thought !== true);
          if (!firstTokenAt && (hasAnyPlainText || (typeof candThought === 'string' && candThought.length > 0))) {
            firstTokenAt = Date.now();
          }
          
          // 检查本事件是否包含思考增量
          let hasThinkingDeltaInEvent = false;
          
          // 处理候选级思考
          if (!textStarted && typeof candThought === 'string' && candThought.length > 0) {
            const newSegment = candThought.slice(lastThinkingText.length);
            if (newSegment.length > 0) {
              if (!thinkingStarted) {
                if (contentBlockOpen) {
                  controller.enqueue(enc.encode(`event: content_block_stop\n`));
                  controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex })}\n\n`));
                  contentBlockIndex++;
                }
                const startBlock = { type: 'content_block_start', index: contentBlockIndex, content_block: { type: 'thinking', thinking: '' } };
                controller.enqueue(enc.encode(`event: content_block_start\n`));
                controller.enqueue(enc.encode(`data: ${JSON.stringify(startBlock)}\n\n`));
                contentBlockOpen = true;
                currentBlockType = 'thinking';
                thinkingStarted = true;
              }
              const deltaEvt = { type: 'content_block_delta', index: contentBlockIndex, delta: { type: 'thinking_delta', thinking: newSegment } };
              controller.enqueue(enc.encode(`event: content_block_delta\n`));
              controller.enqueue(enc.encode(`data: ${JSON.stringify(deltaEvt)}\n\n`));
              lastThinkingText = candThought;
              hasThinkingDeltaInEvent = true;
            }
          }
          
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            
            // 处理part级思考内容
            let thinkingText: string | undefined;
            if (part?.thought === true && typeof part?.text === 'string') {
              thinkingText = part.text;
            } else if (typeof part?.thinking === 'string') {
              thinkingText = part.thinking;
            } else if (typeof part?.internalThought === 'string') {
              thinkingText = part.internalThought;
            }
            
            if (!textStarted && typeof thinkingText === 'string' && thinkingText.length > 0) {
              const prev = partThinkingBuffers[i] || '';
              const newSeg = thinkingText.slice(prev.length);
              if (newSeg.length > 0) {
                if (!thinkingStarted) {
                  if (contentBlockOpen) {
                    controller.enqueue(enc.encode(`event: content_block_stop\n`));
                    controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex })}\n\n`));
                    contentBlockIndex++;
                  }
                  const startBlock = { type: 'content_block_start', index: contentBlockIndex, content_block: { type: 'thinking', thinking: '' } };
                  controller.enqueue(enc.encode(`event: content_block_start\n`));
                  controller.enqueue(enc.encode(`data: ${JSON.stringify(startBlock)}\n\n`));
                  contentBlockOpen = true;
                  currentBlockType = 'thinking';
                  thinkingStarted = true;
                }
                const deltaEvt = { type: 'content_block_delta', index: contentBlockIndex, delta: { type: 'thinking_delta', thinking: newSeg } };
                controller.enqueue(enc.encode(`event: content_block_delta\n`));
                controller.enqueue(enc.encode(`data: ${JSON.stringify(deltaEvt)}\n\n`));
                partThinkingBuffers[i] = thinkingText;
                hasThinkingDeltaInEvent = true;
              }
            }
            
            // 处理普通文本内容（忽略 thought===true 的文本）
            if (part?.text && part?.thought !== true) {
              // 如果本事件包含思考delta且文本尚未开始，则缓存文本到下一事件输出
              if (!textStarted && hasThinkingDeltaInEvent) {
                pendingTextChunks.push(part.text);
                continue;
              }
              
              if (!contentBlockOpen || currentBlockType !== 'text') {
                if (contentBlockOpen) {
                  controller.enqueue(enc.encode(`event: content_block_stop\n`));
                  controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex })}\n\n`));
                  contentBlockIndex++;
                }
                const startBlock = { 
                  type: 'content_block_start', 
                  index: contentBlockIndex, 
                  content_block: { type: 'text', text: '' } 
                };
                controller.enqueue(enc.encode(`event: content_block_start\n`));
                controller.enqueue(enc.encode(`data: ${JSON.stringify(startBlock)}\n\n`));
                contentBlockOpen = true;
                currentBlockType = 'text';
                textStarted = true;
              }
              const deltaEvt = { 
                type: 'content_block_delta', 
                index: contentBlockIndex, 
                delta: { type: 'text_delta', text: part.text } 
              };
              controller.enqueue(enc.encode(`event: content_block_delta\n`));
              controller.enqueue(enc.encode(`data: ${JSON.stringify(deltaEvt)}\n\n`));
            }
            
            // Handle tool calls
            if (part?.functionCall) {
              if (contentBlockOpen) {
                controller.enqueue(enc.encode(`event: content_block_stop\n`));
                controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex })}\n\n`));
                contentBlockOpen = false;
                currentBlockType = null;
                contentBlockIndex++;
              }
              const toolUseId = `toolu_${generateUUID().replace(/-/g, '').slice(0, 24)}`;
              const toolStart = { 
                type: 'content_block_start', 
                index: contentBlockIndex, 
                content_block: { 
                  type: 'tool_use', 
                  id: toolUseId, 
                  name: part.functionCall.name, 
                  input: {} 
                } 
              };
              controller.enqueue(enc.encode(`event: content_block_start\n`));
              controller.enqueue(enc.encode(`data: ${JSON.stringify(toolStart)}\n\n`));
              
              if (part.functionCall.args) {
                const toolDelta = { 
                  type: 'content_block_delta', 
                  index: contentBlockIndex, 
                  delta: { 
                    type: 'input_json_delta', 
                    partial_json: JSON.stringify(part.functionCall.args) 
                  } 
                };
                controller.enqueue(enc.encode(`event: content_block_delta\n`));
                controller.enqueue(enc.encode(`data: ${JSON.stringify(toolDelta)}\n\n`));
              }
              
              controller.enqueue(enc.encode(`event: content_block_stop\n`));
              controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex })}\n\n`));
              contentBlockIndex++;
            }
          }
          
          // 如果没有思考增量且有缓存的文本块，输出它们
          if (!hasThinkingDeltaInEvent && pendingTextChunks.length > 0) {
            for (const textChunk of pendingTextChunks) {
              if (!contentBlockOpen || currentBlockType !== 'text') {
                if (contentBlockOpen) {
                  controller.enqueue(enc.encode(`event: content_block_stop\n`));
                  controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex })}\n\n`));
                  contentBlockIndex++;
                }
                const startBlock = { 
                  type: 'content_block_start', 
                  index: contentBlockIndex, 
                  content_block: { type: 'text', text: '' } 
                };
                controller.enqueue(enc.encode(`event: content_block_start\n`));
                controller.enqueue(enc.encode(`data: ${JSON.stringify(startBlock)}\n\n`));
                contentBlockOpen = true;
                currentBlockType = 'text';
                textStarted = true;
              }
              const deltaEvt = { 
                type: 'content_block_delta', 
                index: contentBlockIndex, 
                delta: { type: 'text_delta', text: textChunk } 
              };
              controller.enqueue(enc.encode(`event: content_block_delta\n`));
              controller.enqueue(enc.encode(`data: ${JSON.stringify(deltaEvt)}\n\n`));
            }
            pendingTextChunks.length = 0;
          }
        } catch (e: any) {
          console.warn('Failed to parse Gemini streaming response:', e);
        }
      }
    },
    
    flush(controller) {
      // 输出任何剩余的缓存文本块
      if (pendingTextChunks.length > 0) {
        for (const textChunk of pendingTextChunks) {
          if (!contentBlockOpen || currentBlockType !== 'text') {
            if (contentBlockOpen) {
              controller.enqueue(enc.encode(`event: content_block_stop\n`));
              controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex })}\n\n`));
              contentBlockIndex++;
            }
            const startBlock = { 
              type: 'content_block_start', 
              index: contentBlockIndex, 
              content_block: { type: 'text', text: '' } 
            };
            controller.enqueue(enc.encode(`event: content_block_start\n`));
            controller.enqueue(enc.encode(`data: ${JSON.stringify(startBlock)}\n\n`));
            contentBlockOpen = true;
            currentBlockType = 'text';
          }
          const deltaEvt = { 
            type: 'content_block_delta', 
            index: contentBlockIndex, 
            delta: { type: 'text_delta', text: textChunk } 
          };
          controller.enqueue(enc.encode(`event: content_block_delta\n`));
          controller.enqueue(enc.encode(`data: ${JSON.stringify(deltaEvt)}\n\n`));
        }
      }
      
      if (contentBlockOpen) {
        controller.enqueue(enc.encode(`event: content_block_stop\n`));
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex })}\n\n`));
      }
      
      const stopEvt = { 
        type: 'message_delta', 
        delta: { stop_reason: 'end_turn', stop_sequence: null }, 
        usage: { output_tokens: totalOutput } 
      };
      controller.enqueue(enc.encode(`event: message_delta\n`));
      controller.enqueue(enc.encode(`data: ${JSON.stringify(stopEvt)}\n\n`));
      
      const endEvt = { type: 'message_stop' };
      controller.enqueue(enc.encode(`event: message_stop\n`));
      controller.enqueue(enc.encode(`data: ${JSON.stringify(endEvt)}\n\n`));
    }
  });
}

/**
 * 处理流式消息请求
 */
async function handleStreamingMessages(
  c: Context,
  geminiModel: string,
  geminiRequest: any,
  selectedKey: string,
  logger: any
) {
  // 添加思考配置 - 对于支持thinking的Gemini模型
  if (geminiModel.includes('2.5') || geminiModel.includes('2.0')) {
    if (geminiRequest.generationConfig) {
      const maxTokens = geminiRequest.generationConfig.maxOutputTokens || 8192;
      const thinkingBudget = Math.max(1024, Math.min(maxTokens - 1, 8192));
      
      geminiRequest.generationConfig.thinkingConfig = {
        includeThoughts: true,
        thinkingBudget: thinkingBudget
      };
      
      logger.info('Added thinking config for Claude streaming', { 
        maxTokens, 
        thinkingBudget,
        includeThoughts: true 
      });
    } else {
      geminiRequest.generationConfig = {
        thinkingConfig: {
          includeThoughts: true,
          thinkingBudget: 8192
        }
      };
      
      logger.info('Created generation config with thinking for Claude streaming', { 
        thinkingBudget: 8192,
        includeThoughts: true 
      });
    }
  }
  
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${selectedKey}`;
  
  logger.info('Calling Gemini streaming API', { model: geminiModel, url: geminiUrl.replace(selectedKey, '***') });

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
      errorData.error?.message || `Gemini API error: ${response.status}`,
      response.status
    );
  }

  // 设置SSE响应头
  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');
  c.header('x-powered-by', 'gemini-code-api');

  const transformStream = createClaudeStreamTransformer(geminiModel, { emitPrelude: true });
  
  return new Response(response.body?.pipeThrough(transformStream), {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'x-powered-by': 'gemini-code-api'
    }
  });
}

/**
 * 创建消息路由
 */
export function createMessagesRoute(): Hono {
  const app = new Hono();

  /**
   * POST /v1/messages
   * Claude消息API兼容端点
   */
  app.post('/', async (c: Context) => {
    const logger = new Logger();

    try {
      logger.info('Claude messages request');

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

      // 映射Claude模型到Gemini模型
      const geminiModel = MODEL_MAPPINGS[requestBody.model as keyof typeof MODEL_MAPPINGS] || 'gemini-2.5-flash';
      logger.info('Model mapping', { claudeModel: requestBody.model, geminiModel });

      // 选择API密钥 - 确保安全访问
      if (!authResult!.validation.validKeys || authResult!.validation.validKeys.length === 0) {
        throwError.authentication('No valid API keys available');
      }
      
      const selectedKey = authResult!.validation.validKeys[0];
      if (!selectedKey) {
        throwError.authentication('Selected API key is invalid');
      }

      // 使用ClaudeTransformer转换请求格式
      const { ClaudeTransformer } = await import('../../adapters/claude/transformer.js');
      const adapterContext = {
        request: c.req.raw,
        context: c,
        clientType: detectionResult!.clientType,
        apiKeys: authResult!.validation.validKeys,
        requestId: generateUUID()
      };
      const geminiRequest = ClaudeTransformer.transformRequest(requestBody, adapterContext);
      
      // 添加思考配置 - 对于支持thinking的Gemini模型
      if (geminiModel.includes('2.5') || geminiModel.includes('2.0')) {
        if (geminiRequest.generationConfig) {
          const maxTokens = geminiRequest.generationConfig.maxOutputTokens || 8192;
          const thinkingBudget = Math.max(1024, Math.min(maxTokens - 1, 8192));
          
          geminiRequest.generationConfig.thinkingConfig = {
            includeThoughts: true,
            thinkingBudget: thinkingBudget
          };
          
          logger.info('Added thinking config for Claude interface', { 
            maxTokens, 
            thinkingBudget,
            includeThoughts: true 
          });
        } else {
          geminiRequest.generationConfig = {
            thinkingConfig: {
              includeThoughts: true,
              thinkingBudget: 8192
            }
          };
          
          logger.info('Created generation config with thinking for Claude interface', { 
            thinkingBudget: 8192,
            includeThoughts: true 
          });
        }
      }
      
      // 添加调试日志
      if (c.req.header('x-debug-request')) {
        logger.info('Debug: Transformed request', { 
          original: requestBody, 
          transformed: geminiRequest 
        });
      }

      // 如果是流式请求，调用流式处理
      if (isStreaming) {
        return await handleStreamingMessages(c, geminiModel, geminiRequest, selectedKey, logger);
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

      // 转换Gemini响应到Claude格式
      const content: any[] = [];
      
      if (responseData.candidates && responseData.candidates[0]) {
        const candidate = responseData.candidates[0];
        const parts = candidate.content?.parts || [];
        
        // 处理候选级思考内容
        const candThought = candidate.thought || candidate.thinking || candidate.internalThought;
        if (typeof candThought === 'string' && candThought.length > 0) {
          content.push({ type: 'thinking', thinking: candThought });
        }
        
        // 处理part级思考内容和普通文本
        let hasThinkingContent = false;
        let textContent = '';
        
        for (const part of parts) {
          // 检查是否为思考内容
          let thinkingText: string | undefined;
          if (part.thought === true && typeof part.text === 'string') {
            thinkingText = part.text;
          } else if (typeof part.thinking === 'string') {
            thinkingText = part.thinking;
          } else if (typeof part.internalThought === 'string') {
            thinkingText = part.internalThought;
          }
          
          if (thinkingText && !hasThinkingContent) {
            content.push({ type: 'thinking', thinking: thinkingText });
            hasThinkingContent = true;
          } else if (part.text && part.thought !== true) {
            // 普通文本内容（忽略 thought===true 的文本）
            textContent += part.text;
          }
        }
        
        // 添加文本内容
        if (textContent) {
          content.push({ type: 'text', text: textContent });
        }
        
        // 如果没有任何内容，添加默认文本
        if (content.length === 0) {
          content.push({ type: 'text', text: parts[0]?.text || 'Error: No response from Gemini API' });
        }
      } else {
        content.push({ type: 'text', text: 'Error: No response from Gemini API' });
      }
      
      const claudeResponse = {
        id: responseData.responseId || 'msg_' + Date.now(),
        type: 'message',
        role: 'assistant',
        content: content,
        model: requestBody.model,
        stop_reason: responseData.candidates?.[0]?.finishReason === 'STOP' ? 'end_turn' :
                    responseData.candidates?.[0]?.finishReason === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: responseData.usageMetadata?.promptTokenCount || 0,
          output_tokens: responseData.usageMetadata?.candidatesTokenCount || 0
        }
      };

      // 设置响应头
      c.header('Content-Type', 'application/json');
      c.header('x-powered-by', 'gemini-code-api');

      return c.json(claudeResponse, 200);
    } catch (error) {
      throw error;
    }
  });

  /**
   * OPTIONS /v1/messages
   * CORS预检请求处理
   */
  app.options('/', async () => {
    return new Response('', { status: 204 });
  });

  return app;
}