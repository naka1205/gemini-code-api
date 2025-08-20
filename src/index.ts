import { Hono } from 'hono';

// Import custom middleware
import { corsMiddleware } from './middleware/cors';
import { loggerMiddleware } from './middleware/logger';

// Import route handlers
import v1Routes from './routes/v1';
import v1betaRoutes from './routes/v1beta';
// import { chatRoutes } from './routes/chat';

export interface Env {
  DB: D1Database;
  [key: string]: any;
}

const app = new Hono<{ Bindings: Env }>();

// Custom middleware
app.use('*', corsMiddleware);
app.use('*', loggerMiddleware);

// Health check endpoint
app.get('/health', async (c) => {
  const timestamp = new Date().toISOString();
  
  try {
    // Test database connectivity
    const db = c.env.DB;
    await db.prepare('SELECT 1').first();
    
    // Check if API keys are configured
    const apiKeysConfigured = !!(c.env.GEMINI_API_KEYS);
    
    return c.json({ 
      status: 'healthy',
      timestamp,
      database: 'connected',
      apiKeys: apiKeysConfigured ? 'configured' : 'missing',
      version: '1.0.0'
    });
  } catch (error) {
    return c.json({ 
      status: 'unhealthy',
      timestamp,
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
      version: '1.0.0'
    }, 503);
  }
});

// API routes
app.route('/v1', v1Routes);
app.route('/v1beta', v1betaRoutes);
// app.route('/chat', chatRoutes);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ 
    error: 'Internal Server Error',
    message: err.message 
  }, 500);
});

export default app;