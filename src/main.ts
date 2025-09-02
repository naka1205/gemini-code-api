
// src/main.ts
import { Hono } from 'hono';
import { AppContext } from './common/types';
import { Container } from './logic/container';
import { appConfig, getHttpConfig, getCacheConfig, getSecurityConfig } from './config/app';

// Middleware
import { errorMiddleware } from './api/middleware/error';
import { authMiddleware } from './api/middleware/auth';
import { corsMiddleware } from './api/middleware/cors';
import { requestLoggerMiddleware } from './api/middleware/logger';

// Services, Adapters, and Transformers
import { HttpClient } from './base/http/client';
import { BalancerService, SmartBalancerStrategy } from './logic/services/balancer';
import { QuotaService } from './logic/services/quota';
import { BlacklistService } from './logic/services/blacklist';
import { KvStorage } from './base/storage/kv';
import { DbStorage } from './base/storage/db';
import { CacheService } from './logic/services/cache';
import { OpenAITransformer } from './logic/transformers/openai';
import { ClaudeTransformer } from './logic/transformers/claude';
import { NativeTransformer } from './logic/transformers/native';
import { OpenAIAdapter } from './logic/adapters/openai';
import { ClaudeAdapter } from './logic/adapters/claude';
import { GeminiAdapter } from './logic/adapters/gemini';

// Routes
import { createChatRoute } from './api/routes/chat';
import { createMessagesRoute } from './api/routes/messages';
import { createGenerateRoute } from './api/routes/generate';
import { createEmbeddingsRoute } from './api/routes/embeddings';
import { createHealthRoute } from './api/routes/health';

export interface Env {
  DB: any;
  KV: any;
}

const app = new Hono<AppContext>();
const container = Container.getInstance();

// --- Middleware Setup ---
// Apply CORS first (must be before other middleware)
const securityConfig = getSecurityConfig();
if (securityConfig.enableCors) {
  app.use('*', corsMiddleware({
    origin: securityConfig.allowedOrigins,
    credentials: true
  }));
}

// Request logging middleware
if (appConfig.getMonitoringConfig().enableRequestLogging) {
  app.use('*', requestLoggerMiddleware({
    logLevel: 'info',
    logRequestBody: false,
    logResponseBody: false,
    includePerformanceMetrics: true
  }));
}

// Error handling middleware
app.use('*', errorMiddleware());

// Authentication middleware for API routes
app.use('/v1/*', authMiddleware());
app.use('/v1beta/*', authMiddleware());

// --- Dependency Injection Setup ---
// This setup runs once when the worker is initialized.
app.use('*', async (c, next) => {
  // Register environment-dependent services
  const dbStorage = new DbStorage(c.env.DB);
  const kvStorage = new KvStorage(c.env.KV);
  
  // Base Layer - HTTP Client with retry configuration
  const httpConfig = getHttpConfig();
  const httpClient = new HttpClient(httpConfig.retryConfig);
  httpClient.setDefaultTimeout(httpConfig.timeout);
  container.register('httpClient', () => httpClient);
  
  // Logic Layer - Services
  const blacklistService = new BlacklistService(kvStorage);
  const quotaService = new QuotaService(dbStorage);
  const balancerStrategy = new SmartBalancerStrategy(quotaService, blacklistService);
  container.register('balancerService', () => new BalancerService(balancerStrategy));
  
  // Cache Service with configuration
  const cacheConfig = getCacheConfig();
  container.register('cacheService', () => new CacheService(cacheConfig.maxSize));

  // Logic Layer - Transformers
  container.register('openaiTransformer', () => new OpenAITransformer());
  container.register('claudeTransformer', () => new ClaudeTransformer());
  container.register('nativeTransformer', () => new NativeTransformer());

  // Logic Layer - Adapters (with injected transformers)
  container.register('openaiAdapter', () => new OpenAIAdapter(
    container.get('httpClient'), 
    container.get('balancerService'), 
    container.get('cacheService'), 
    dbStorage, 
    container.get('openaiTransformer')
  ));
  container.register('claudeAdapter', () => new ClaudeAdapter(
    container.get('httpClient'), 
    container.get('balancerService'), 
    container.get('cacheService'), 
    dbStorage, 
    container.get('claudeTransformer')
  ));
  container.register('geminiAdapter', () => new GeminiAdapter(
    container.get('httpClient'), 
    container.get('balancerService'), 
    container.get('cacheService'), 
    dbStorage, 
    container.get('nativeTransformer')
  ));
  
  c.set('container', container);
  await next();
});

// --- Route Registration ---
const routes = new Hono();
// Pass the container to the route creation functions
routes.route('/', createChatRoute(container));
routes.route('/', createMessagesRoute(container));
routes.route('/', createGenerateRoute(container));
routes.route('/', createEmbeddingsRoute(container));
routes.route('/', createHealthRoute(container));

app.route('/', routes);

export default app;
