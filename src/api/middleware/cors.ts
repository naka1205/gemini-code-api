// src/api/middleware/cors.ts
import { Context, Next } from 'hono';
import { getGlobalLogger } from '../../base/logging/logger';

export interface CorsOptions {
  origin: string | string[] | boolean | ((origin: string) => boolean);
  methods: string[];
  allowedHeaders: string[];
  exposedHeaders?: string[];
  credentials: boolean;
  maxAge?: number;
  preflightContinue?: boolean;
  optionsSuccessStatus?: number;
}

export const DEFAULT_CORS_OPTIONS: CorsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With', 
    'Content-Type',
    'Accept',
    'Authorization',
    'X-API-Key',
    'X-Goog-API-Key'
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset'
  ],
  credentials: true,
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 204
};

export function corsMiddleware(options: Partial<CorsOptions> = {}) {
  const config: CorsOptions = { ...DEFAULT_CORS_OPTIONS, ...options };
  const logger = getGlobalLogger();

  return async (c: Context, next: Next) => {
    const origin = c.req.header('origin');
    const method = c.req.method;

    // Set Access-Control-Allow-Origin
    const allowedOrigin = getAllowedOrigin(origin, config.origin);
    if (allowedOrigin) {
      c.res.headers.set('Access-Control-Allow-Origin', allowedOrigin);
    }

    // Set Access-Control-Allow-Credentials
    if (config.credentials) {
      c.res.headers.set('Access-Control-Allow-Credentials', 'true');
    }

    // Set Access-Control-Expose-Headers
    if (config.exposedHeaders && config.exposedHeaders.length > 0) {
      c.res.headers.set('Access-Control-Expose-Headers', config.exposedHeaders.join(', '));
    }

    // Handle preflight request
    if (method === 'OPTIONS') {
      logger.debug('Handling CORS preflight request', {
        origin,
        method,
        requestedMethod: c.req.header('access-control-request-method'),
        requestedHeaders: c.req.header('access-control-request-headers')
      });

      // Set Access-Control-Allow-Methods
      c.res.headers.set('Access-Control-Allow-Methods', config.methods.join(', '));

      // Set Access-Control-Allow-Headers
      const requestedHeaders = c.req.header('access-control-request-headers');
      if (requestedHeaders) {
        const allowedHeaders = getAllowedHeaders(requestedHeaders, config.allowedHeaders);
        c.res.headers.set('Access-Control-Allow-Headers', allowedHeaders);
      } else {
        c.res.headers.set('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));
      }

      // Set Access-Control-Max-Age
      if (config.maxAge !== undefined) {
        c.res.headers.set('Access-Control-Max-Age', config.maxAge.toString());
      }

      // Set Vary header to indicate response varies by Origin
      c.res.headers.set('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');

      if (!config.preflightContinue) {
        c.status(config.optionsSuccessStatus || 204 as any);
        return c.body('');
      }
    } else {
      // For non-preflight requests, set Vary header
      c.res.headers.set('Vary', 'Origin');
    }

    // Log CORS-enabled request
    logger.debug('CORS middleware applied', {
      origin,
      method,
      allowedOrigin,
      credentials: config.credentials
    });

    await next();
  };
}

/**
 * Determine the allowed origin based on configuration
 */
function getAllowedOrigin(requestOrigin: string | undefined, configOrigin: string | string[] | boolean | ((origin: string) => boolean)): string | null {
  if (!requestOrigin) {
    return null;
  }

  if (configOrigin === true) {
    return requestOrigin;
  }

  if (configOrigin === false) {
    return null;
  }

  if (configOrigin === '*') {
    return '*';
  }

  if (typeof configOrigin === 'string') {
    return configOrigin === requestOrigin ? requestOrigin : null;
  }

  if (Array.isArray(configOrigin)) {
    return configOrigin.includes(requestOrigin) ? requestOrigin : null;
  }

  if (typeof configOrigin === 'function') {
    return configOrigin(requestOrigin) ? requestOrigin : null;
  }

  return null;
}

/**
 * Get allowed headers from request headers and config
 */
function getAllowedHeaders(requestedHeaders: string, configHeaders: string[]): string {
  const requested = requestedHeaders
    .split(',')
    .map(h => h.trim().toLowerCase());
  
  const allowed = configHeaders.map(h => h.toLowerCase());
  
  const validHeaders = requested.filter(h => allowed.includes(h));
  
  // Return original casing from config for valid headers
  return configHeaders
    .filter(h => validHeaders.includes(h.toLowerCase()))
    .join(', ');
}

/**
 * Create CORS middleware with common presets
 */
export const createCorsPresets = {
  /**
   * Very permissive CORS - allows all origins, methods, and headers
   */
  permissive(): ReturnType<typeof corsMiddleware> {
    return corsMiddleware({
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'],
      allowedHeaders: ['*'],
      credentials: true
    });
  },

  /**
   * API-focused CORS - suitable for REST APIs
   */
  api(allowedOrigins?: string[]): ReturnType<typeof corsMiddleware> {
    return corsMiddleware({
      origin: allowedOrigins || ['*'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-API-Key',
        'X-Requested-With'
      ],
      credentials: true,
      maxAge: 86400
    });
  },

  /**
   * Restrictive CORS - for specific origins
   */
  restrictive(allowedOrigins: string[]): ReturnType<typeof corsMiddleware> {
    return corsMiddleware({
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: false,
      maxAge: 3600
    });
  }
};