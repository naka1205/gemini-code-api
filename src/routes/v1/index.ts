// src/routes/v1/index.ts
import { Hono } from 'hono';
import chatCompletions from './chat/completions.post';
import embeddings from './embeddings.post';
import models from './models.get';
import messages from './messages.post';
import catchAll from './[...path].post';

const app = new Hono();

// Specific routes first (more specific routes should come before catch-all)
// OpenAI API routes
app.route('/chat/completions', chatCompletions);
app.route('/embeddings', embeddings);
app.route('/models', models);

// Claude API routes
app.route('/messages', messages);

// Catch-all route for native Gemini API calls (should be last)
app.route('/', catchAll);

export default app;