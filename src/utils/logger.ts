/**
 * 统一日志接口
 * 替换直接的console调用，提供结构化日志记录
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: Record<string, any>;
  error?: Error;
  source?: string;
}

export interface Logger {
  debug(message: string, context?: Record<string, any>): void;
  info(message: string, context?: Record<string, any>): void;
  warn(message: string, context?: Record<string, any>): void;
  error(message: string, error?: Error, context?: Record<string, any>): void;
}

/**
 * 生产环境日志实现
 */
export class ProductionLogger implements Logger {
  private minLevel: LogLevel;
  private enableConsole: boolean;

  constructor(
    minLevel: LogLevel = LogLevel.INFO,
    enableConsole: boolean = true
  ) {
    this.minLevel = minLevel;
    this.enableConsole = enableConsole;
  }

  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, error?: Error, context?: Record<string, any>): void {
    const entry: LogEntry = {
      level: LogLevel.ERROR,
      message,
      timestamp: Date.now(),
      ...(context && { context }),
      ...(error && { error }),
    };
    
    this.output(entry);
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>): void {
    if (level < this.minLevel) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      ...(context && { context }),
    };

    this.output(entry);
  }

  private output(entry: LogEntry): void {
    if (!this.enableConsole) {
      return;
    }

    const timestamp = new Date(entry.timestamp).toISOString();
    const levelName = LogLevel[entry.level];
    const maskedContext = entry.context ? maskSensitiveData(entry.context) : undefined;
    const contextStr = maskedContext ? ` ${JSON.stringify(maskedContext)}` : '';
    const maskedError = entry.error ? new Error(maskSensitiveString(entry.error.stack || entry.error.message)) : undefined;
    const errorStr = maskedError ? ` ${maskedError.stack || maskedError.message}` : '';
    
    const logMessage = `[${timestamp}] ${levelName}: ${maskSensitiveString(entry.message)}${contextStr}${errorStr}`;

    switch (entry.level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        console.log(logMessage);
        break;
      case LogLevel.WARN:
        console.warn(logMessage);
        break;
      case LogLevel.ERROR:
        console.error(logMessage);
        break;
    }
  }
}

/**
 * 脱敏字符串中的敏感信息（如 Google API Key 等）
 */
function maskSensitiveString(input: string): string {
  if (!input) return input;
  let masked = input;
  // Google API Key（AIza 开头 39 字符长度常见）
  masked = masked.replace(/AIza[0-9A-Za-z\-_]{35}/g, 'AIza***MASKED***');
  // Bearer Token（常见 Authorization）
  masked = masked.replace(/Bearer\s+([A-Za-z0-9_\-\.]{10,})/gi, 'Bearer ***MASKED***');
  // x-api-key 风格
  masked = masked.replace(/x-api-key\s*[:=]\s*([A-Za-z0-9_\-\.]{10,})/gi, 'x-api-key: ***MASKED***');
  // x-goog-api-key
  masked = masked.replace(/x-goog-api-key\s*[:=]\s*([A-Za-z0-9_\-\.]{10,})/gi, 'x-goog-api-key: ***MASKED***');
  return masked;
}

/**
 * 深度脱敏对象中的敏感字段
 */
function maskSensitiveData<T>(data: T): T {
  if (data == null) return data;
  if (typeof data === 'string') {
    return maskSensitiveString(data) as unknown as T;
  }
  if (Array.isArray(data)) {
    return data.map(item => maskSensitiveData(item)) as unknown as T;
  }
  if (typeof data === 'object') {
    const masked: Record<string, any> = Array.isArray(data) ? [] : {};
    for (const [key, value] of Object.entries(data as Record<string, any>)) {
      const lowerKey = key.toLowerCase();
      if (['authorization', 'x-api-key', 'x-goog-api-key', 'api_key', 'apikey', 'token', 'access_token'].includes(lowerKey)) {
        masked[key] = typeof value === 'string' ? '***MASKED***' : maskSensitiveData(value);
      } else if (typeof value === 'string') {
        masked[key] = maskSensitiveString(value);
      } else {
        masked[key] = maskSensitiveData(value);
      }
    }
    return masked as unknown as T;
  }
  return data;
}

/**
 * 测试环境日志实现（静默）
 */
export class TestLogger implements Logger {
  private logs: LogEntry[] = [];

  debug(message: string, context?: Record<string, any>): void {
    this.addLog(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, any>): void {
    this.addLog(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, any>): void {
    this.addLog(LogLevel.WARN, message, context);
  }

  error(message: string, error?: Error, context?: Record<string, any>): void {
    this.addLog(LogLevel.ERROR, message, context, error);
  }

  private addLog(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      ...(context && { context }),
      ...(error && { error }),
    };
    this.logs.push(entry);
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clear(): void {
    this.logs = [];
  }
}

/**
 * 全局日志实例
 */
let globalLogger: Logger | null = null;

export function createLogger(isTest: boolean = false): Logger {
  if (isTest) {
    return new TestLogger();
  }
  
  return new ProductionLogger(LogLevel.INFO, true);
}

export function getGlobalLogger(): Logger {
  if (!globalLogger) {
    // 单一生产环境部署，始终使用生产日志器
    globalLogger = createLogger(false);
  }
  return globalLogger;
}

export function setGlobalLogger(logger: Logger): void {
  globalLogger = logger;
}

/**
 * 便捷的日志函数
 */
export const log = {
  debug: (message: string, context?: Record<string, any>) => 
    getGlobalLogger().debug(message, context),
  
  info: (message: string, context?: Record<string, any>) => 
    getGlobalLogger().info(message, context),
  
  warn: (message: string, context?: Record<string, any>) => 
    getGlobalLogger().warn(message, context),
  
  error: (message: string, error?: Error, context?: Record<string, any>) => 
    getGlobalLogger().error(message, error, context),
};