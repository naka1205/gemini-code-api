/**
 * Gemini Code API 2.0
 * 主应用入口文件 - 高性能多协议AI网关服务
 * 
 * 功能特性：
 * - 纯代理模式：客户端提交API KEY，系统不存储敏感信息
 * - 多协议支持：OpenAI、Claude、Gemini API兼容
 * - 智能负载均衡：基于KEY性能自动选择最优密钥
 * - 实时健康监控：系统状态和性能指标监控
 * - 类型安全：完整的TypeScript支持
 */

import { Hono } from 'hono';
import type { Context } from 'hono';

// 中间件导入 - 使用相对路径
import { cors } from './middleware/cors.js';
import { logger } from './middleware/logger.js';
import { errorHandler } from './middleware/error-handler.js';

// 路由导入 - 使用相对路径
import { createHealthRoutes } from './routes/health.js';
import { createChatCompletionsRoute } from './routes/v1/chat.js';
import { createEmbeddingsRoute } from './routes/v1/embeddings.js';
import { createModelsRoute } from './routes/v1/models.js';
import { createMessagesRoute } from './routes/v1/messages.js';
import { createGenerateContentRoute } from './routes/v1beta/generate.js';
import { createGeminiModelsRoute } from './routes/v1beta/models.js';

// 工具导入 - 使用相对路径
import { flushLogs } from './middleware/logger.js';
import { log } from './utils/logger.js';

/**
 * 应用版本信息
 */
const APP_INFO = {
  name: 'Gemini Code API',
  version: '2.0.0',
  description: '高性能多协议AI网关服务，支持OpenAI、Claude与Gemini API的统一访问接口',
  features: [
    '纯代理模式 - 客户端提交API KEY',
    '多协议兼容 - OpenAI/Claude/Gemini',
    '智能负载均衡 - 基于性能自动选择',
    '实时健康监控 - 完整的系统监控',
    '类型安全 - 完整TypeScript支持'
  ],
  repository: 'https://github.com/gemini-code/gemini-code-api',
  documentation: 'https://docs.gemini-code.dev',
} as const;

/**
 * 创建主应用实例
 */
function createApp(): Hono {
  const app = new Hono();

  // === 全局中间件 ===
  
  // 1. CORS处理 - 支持跨域请求
  app.use('/*', cors({
    origin: '*', // 允许所有来源，生产环境中应该限制具体域名
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-api-key',
      'x-goog-api-key',
      'anthropic-version',
      'anthropic-beta',
      'openai-organization',
      'openai-project',
    ],
    exposedHeaders: [
      'x-request-id',
      'x-response-time',
      'x-rate-limit-remaining',
      'x-rate-limit-reset',
    ],
  }));

  // 2. 请求日志记录
  app.use('/*', logger());

  // 3. 错误处理中间件
  app.use('/*', errorHandler());

  // === 根路径信息 ===
  
  app.get('/', (c: Context) => {
    return c.json({
      ...APP_INFO,
      status: 'operational',
      timestamp: new Date().toISOString(),
      endpoints: {
        health: '/health',
        openai: {
          chat: '/v1/chat/completions',
          embeddings: '/v1/embeddings',
          models: '/v1/models',
        },
        claude: {
          messages: '/v1/messages',
        },
        gemini: {
          models: '/v1beta/models',
          generate: '/v1beta/models/{model}:generateContent',
          stream: '/v1beta/models/{model}:streamGenerateContent',
          embed: '/v1beta/models/{model}:embedContent',
        },
      },
      usage: {
        authentication: 'Provide your Gemini API key(s) in the appropriate header',
        multiple_keys: 'Separate multiple keys with commas for load balancing',
        headers: {
          openai: 'Authorization: Bearer your_gemini_key1,your_gemini_key2',
          claude: 'x-api-key: your_gemini_key1,your_gemini_key2',
          gemini: 'x-goog-api-key: your_gemini_key1,your_gemini_key2',
        },
      }
    });
  });

  // === 健康检查路由 ===
  
  app.route('/health', createHealthRoutes());

  // === V1 API路由 (OpenAI/Claude兼容) ===
  
  app.route('/v1/chat/completions', createChatCompletionsRoute());
  app.route('/v1/embeddings', createEmbeddingsRoute());
  app.route('/v1/models', createModelsRoute());
  app.route('/v1/messages', createMessagesRoute()); // Claude兼容

  // === V1Beta API路由 (Gemini原生) ===
  
  // 挂载v1beta子路由，路径匹配将由子路由处理
  app.route('/v1beta', createGenerateContentRoute());
  app.route('/v1beta/models', createGeminiModelsRoute());

  // === 404处理 ===
  
  app.notFound((c: Context) => {
    return c.json({
      error: {
        type: 'not_found',
        message: `Endpoint ${c.req.method} ${c.req.path} not found`,
        available_endpoints: [
          '/health',
          '/v1/chat/completions',
          '/v1/embeddings', 
          '/v1/models',
          '/v1/messages',
          '/v1beta/models',
          '/v1beta/models/{model}:generateContent',
        ],
        documentation: APP_INFO.documentation,
      },
    }, 404);
  });

  return app;
}

/**
 * 应用清理函数
 */
function cleanup(): void {
  log.info('🧹 Cleaning up application...');
  
  try {
    // 刷新待处理的日志
    flushLogs();
    
    log.info('✅ Application cleanup completed');
  } catch (error) {
    log.error('❌ Error during cleanup:', error as Error);
  }
}

/**
 * 应用启动函数
 */
function startup(): void {
  log.info(`🚀 Starting ${APP_INFO.name} v${APP_INFO.version}`);
  log.info(`📝 ${APP_INFO.description}`);
  log.info('');
  log.info('🔧 Features:');
  APP_INFO.features.forEach(feature => {
    log.info(`   • ${feature}`);
  });
  log.info('');
  log.info('🌐 API Endpoints:');
  log.info('   • Health Check: /health');
  log.info('   • OpenAI Compatible: /v1/chat/completions, /v1/embeddings, /v1/models');
  log.info('   • Claude Compatible: /v1/messages');
  log.info('   • Gemini Native: /v1beta/models/{model}:generateContent');
  log.info('');
  log.info('🔑 Authentication: Provide Gemini API keys in request headers');
  log.info('⚖️  Load Balancing: Multiple keys supported (comma-separated)');
  log.info('🛡️  Security: Pure proxy mode - no API keys stored');
  log.info('');
}

// === 应用初始化 ===

// 启动日志
startup();

// 创建应用实例
const app = createApp();

// 导出主应用 (Cloudflare Workers需要default导出)
export default {
  /**
   * 处理HTTP请求
   */
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    try {
      return await app.fetch(request, env, ctx);
    } catch (error) {
      log.error('❌ Unhandled error in fetch handler:', error as Error);
      
      return new Response(JSON.stringify({
        error: {
          type: 'internal_server_error',
          message: 'An unexpected error occurred',
          timestamp: Date.now(),
          request_id: 'unknown',
        },
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
  },

  /**
   * 定时任务处理 (可选)
   */
  async scheduled(_event: ScheduledEvent, _env: any, _ctx: ExecutionContext): Promise<void> {
    log.info('⏰ Scheduled task triggered');
    
    try {
      // 执行定期维护任务
      // 例如：清理过期缓存、统计数据等
      log.info('🧹 Running scheduled maintenance tasks...');
      
      // 刷新日志
      flushLogs();
      
      log.info('✅ Scheduled tasks completed');
    } catch (error) {
      log.error('❌ Error in scheduled task:', error as Error);
    }
  },
};

// === 优雅关闭处理 (Workers环境中的模拟) ===

// 注意：Cloudflare Workers没有传统的process事件
// 但我们可以在某些情况下执行清理逻辑
if (typeof globalThis !== 'undefined') {
  // 模拟优雅关闭
  const originalAddEventListener = globalThis.addEventListener;
  if (typeof originalAddEventListener === 'function') {
    try {
      // 在Cloudflare Workers中这些事件可能不存在，用as any处理
      globalThis.addEventListener('beforeunload' as any, cleanup);
      globalThis.addEventListener('unload' as any, cleanup);
    } catch (error) {
      // 在Workers环境中这些事件可能不可用，忽略错误
    }
  }
}

// 导出应用实例用于测试
export { app, createApp, APP_INFO };