/**
 * CORS中间件
 * 处理跨域请求和预检请求
 */
import type { Context, Next } from 'hono';
import { AUTH_CONFIG } from '../utils/constants.js';

/**
 * CORS配置选项
 */
export interface CorsOptions {
  origin?: string | string[] | ((origin: string) => boolean);
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
  preflightContinue?: boolean;
  optionsSuccessStatus?: number;
}

/**
 * 默认CORS配置
 */
const DEFAULT_CORS_OPTIONS: Required<CorsOptions> = {
  origin: AUTH_CONFIG.ALLOWED_ORIGINS as any,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization', 
    'x-api-key',
    'x-goog-api-key',
    'anthropic-version',
    'anthropic-beta',
    'openai-organization',
    'openai-project',
    'user-agent',
    'accept',
    'accept-encoding',
    'cache-control',
    'connection',
    'content-length',
    'host',
    'origin',
    'pragma',
    'referer',
    'sec-fetch-dest',
    'sec-fetch-mode',
    'sec-fetch-site',
    'x-requested-with',
  ],
  exposedHeaders: [
    'x-request-id',
    'x-response-time',
    'x-rate-limit-remaining',
    'x-rate-limit-reset',
  ],
  credentials: false,
  maxAge: 86400, // 24小时
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

/**
 * 创建CORS中间件
 */
export function cors(options: Partial<CorsOptions> = {}) {
  const config = { ...DEFAULT_CORS_OPTIONS, ...options };

  return async (c: Context, next: Next) => {
    const request = c.req;
    const origin = request.header('origin') || '';
    const method = request.method.toUpperCase();

    // 检查是否允许该来源
    const isOriginAllowed = checkOrigin(origin, config.origin);

    // 设置基础CORS头
    if (isOriginAllowed) {
      c.header('Access-Control-Allow-Origin', origin || '*');
    } else if (config.origin === '*' || (Array.isArray(config.origin) && config.origin.includes('*'))) {
      c.header('Access-Control-Allow-Origin', '*');
    }

    if (config.credentials) {
      c.header('Access-Control-Allow-Credentials', 'true');
    }

    // 设置暴露的头
    if (config.exposedHeaders.length > 0) {
      c.header('Access-Control-Expose-Headers', config.exposedHeaders.join(', '));
    }

    // 处理预检请求 (OPTIONS)
    if (method === 'OPTIONS') {
      return handlePreflightRequest(c, config);
    }

    // 继续处理实际请求
    await next();
  };
}

/**
 * 处理预检请求
 */
function handlePreflightRequest(c: Context, config: Required<CorsOptions>): Response {
  const request = c.req;
  const requestMethod = request.header('access-control-request-method');
  const requestHeaders = request.header('access-control-request-headers');

  // 检查请求的方法是否被允许
  if (requestMethod && config.methods.includes(requestMethod.toUpperCase())) {
    c.header('Access-Control-Allow-Methods', config.methods.join(', '));
  }

  // 检查请求的头是否被允许
  if (requestHeaders) {
    const headers = requestHeaders.split(',').map(h => h.trim().toLowerCase());
    const allowedHeaders = config.allowedHeaders.map(h => h.toLowerCase());
    
    const isHeadersAllowed = headers.every(header => allowedHeaders.includes(header));
    
    if (isHeadersAllowed) {
      c.header('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));
    }
  } else {
    c.header('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));
  }

  // 设置预检缓存时间
  c.header('Access-Control-Max-Age', config.maxAge.toString());

  // 返回预检响应
  return c.body(null, config.optionsSuccessStatus as any);
}

/**
 * 检查来源是否被允许
 */
function checkOrigin(origin: string, allowedOrigin: string | string[] | ((origin: string) => boolean)): boolean {
  if (!origin) {
    return true; // 没有origin头，允许（可能是同源请求）
  }

  if (typeof allowedOrigin === 'function') {
    return allowedOrigin(origin);
  }

  if (typeof allowedOrigin === 'string') {
    return allowedOrigin === '*' || allowedOrigin === origin;
  }

  if (Array.isArray(allowedOrigin)) {
    return allowedOrigin.includes('*') || allowedOrigin.includes(origin);
  }

  return false;
}

/**
 * 严格的CORS中间件（用于生产环境）
 */
export function strictCors(allowedOrigins: string[]) {
  return cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-api-key',
      'x-goog-api-key',
    ],
  });
}

/**
 * 宽松的CORS中间件（用于开发环境）
 */
export function permissiveCors() {
  return cors({
    origin: '*',
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  });
}

/**
 * 检查请求是否为预检请求
 */
export function isPreflightRequest(request: Request): boolean {
  return (
    request.method === 'OPTIONS' &&
    request.headers.has('access-control-request-method')
  );
}

/**
 * 获取请求的来源信息
 */
export function getOriginInfo(request: Request): {
  origin: string | null;
  referer: string | null;
  userAgent: string | null;
  isLocalhost: boolean;
  isDevelopment: boolean;
} {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const userAgent = request.headers.get('user-agent');

  const isLocalhost = origin ? 
    (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('0.0.0.0')) : 
    false;

  const isDevelopment = origin ?
    (isLocalhost || origin.includes('dev') || origin.includes('staging')) :
    false;

  return {
    origin,
    referer,
    userAgent,
    isLocalhost,
    isDevelopment,
  };
}