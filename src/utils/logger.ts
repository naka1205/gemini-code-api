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
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
    const errorStr = entry.error ? ` ${entry.error.stack || entry.error.message}` : '';
    
    const logMessage = `[${timestamp}] ${levelName}: ${entry.message}${contextStr}${errorStr}`;

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