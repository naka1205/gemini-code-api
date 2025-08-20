// src/routes/v1beta/index.ts
import { Hono } from 'hono';
import catchAll from './[...path].post';

const app = new Hono();

// v1beta is primarily for native Gemini API calls
// All requests go through the catch-all handler
app.route('/', catchAll);

export default app;