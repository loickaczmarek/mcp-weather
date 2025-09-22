import { randomUUID } from 'crypto';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

export interface LogContext {
  correlationId?: string;
  userId?: string;
  tool?: string;
  operation?: string;
  latitude?: number;
  longitude?: number;
  cacheStatus?: 'HIT' | 'MISS' | undefined;
  responseTime?: number;
  httpMethod?: string;
  endpoint?: string;
  userAgent?: string;
  ip?: string;
  statusCode?: number;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

export interface PerformanceMetrics {
  toolCalls: Record<string, number>;
  responseTimes: Record<string, number[]>;
  cacheHitRate: number;
  errorCounts: Record<string, number>;
  activeConnections: number;
  memoryUsage: number;
}

export class StructuredLogger {
  private static instance: StructuredLogger;
  private metrics: PerformanceMetrics = {
    toolCalls: {},
    responseTimes: {},
    cacheHitRate: 0,
    errorCounts: {},
    activeConnections: 0,
    memoryUsage: 0
  };

  private constructor() {}

  public static getInstance(): StructuredLogger {
    if (!StructuredLogger.instance) {
      StructuredLogger.instance = new StructuredLogger();
    }
    return StructuredLogger.instance;
  }

  private formatLog(level: LogLevel, message: string, context: LogContext = {}, error?: Error): LogEntry {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        correlationId: context.correlationId || randomUUID(),
        ...context
      }
    };

    if (error) {
      logEntry.error = {
        name: error.name,
        message: error.message,
        ...(error.stack && { stack: error.stack }),
        ...((error as any).code && { code: (error as any).code })
      };
    }

    return logEntry;
  }

  private output(logEntry: LogEntry): void {
    const colorMap = {
      [LogLevel.DEBUG]: '\x1b[90m', // Gray
      [LogLevel.INFO]: '\x1b[36m',  // Cyan
      [LogLevel.WARN]: '\x1b[33m',  // Yellow
      [LogLevel.ERROR]: '\x1b[31m'  // Red
    };

    const iconMap = {
      [LogLevel.DEBUG]: '🔍',
      [LogLevel.INFO]: 'ℹ️',
      [LogLevel.WARN]: '⚠️',
      [LogLevel.ERROR]: '❌'
    };

    const reset = '\x1b[0m';
    const color = colorMap[logEntry.level] || '';
    const icon = iconMap[logEntry.level] || '';

    // Console output with colors for development
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `${color}${icon} [${logEntry.level}] ${logEntry.timestamp}${reset} ${logEntry.message}`,
        logEntry.context.correlationId ? `(${logEntry.context.correlationId.slice(0, 8)})` : '',
        logEntry.context
      );

      if (logEntry.error) {
        console.error(`${color}Error:${reset}`, logEntry.error.message);
        if (logEntry.error.stack) {
          console.error(`${color}Stack:${reset}`, logEntry.error.stack);
        }
      }
    } else {
      // JSON output for production logging systems
      console.log(JSON.stringify(logEntry));
    }
  }

  public debug(message: string, context: LogContext = {}): void {
    if (process.env.LOG_LEVEL === 'DEBUG' || process.env.NODE_ENV !== 'production') {
      this.output(this.formatLog(LogLevel.DEBUG, message, context));
    }
  }

  public info(message: string, context: LogContext = {}): void {
    this.output(this.formatLog(LogLevel.INFO, message, context));
  }

  public warn(message: string, context: LogContext = {}, error?: Error): void {
    this.output(this.formatLog(LogLevel.WARN, message, context, error));
  }

  public error(message: string, context: LogContext = {}, error?: Error): void {
    this.output(this.formatLog(LogLevel.ERROR, message, context, error));

    // Update error metrics
    const errorType = error?.name || 'UnknownError';
    this.metrics.errorCounts[errorType] = (this.metrics.errorCounts[errorType] || 0) + 1;
  }

  // Audit logging for tool calls
  public auditToolCall(toolName: string, context: LogContext): void {
    this.info(`Tool called: ${toolName}`, {
      ...context,
      operation: 'tool_call',
      tool: toolName
    });

    // Update metrics
    this.metrics.toolCalls[toolName] = (this.metrics.toolCalls[toolName] || 0) + 1;

    if (context.responseTime) {
      if (!this.metrics.responseTimes[toolName]) {
        this.metrics.responseTimes[toolName] = [];
      }
      this.metrics.responseTimes[toolName].push(context.responseTime);

      // Keep only last 100 response times for each tool
      if (this.metrics.responseTimes[toolName].length > 100) {
        this.metrics.responseTimes[toolName] = this.metrics.responseTimes[toolName].slice(-100);
      }
    }
  }

  // Performance logging
  public logPerformance(operation: string, duration: number, context: LogContext = {}): void {
    const level = duration > 1000 ? LogLevel.WARN : LogLevel.INFO;
    const emoji = duration > 1000 ? '🐌' : '⚡';

    const logMethod = level.toLowerCase() as 'info' | 'warn';
    this[logMethod](
      `${emoji} ${operation} completed in ${duration}ms`,
      { ...context, responseTime: duration, operation: 'performance' }
    );
  }

  // Cache performance logging
  public logCacheOperation(operation: 'HIT' | 'MISS' | 'SET' | 'CLEAR', key: string, context: LogContext = {}): void {
    const emoji = operation === 'HIT' ? '💾✅' : operation === 'MISS' ? '💾❌' : operation === 'SET' ? '💾💽' : '💾🗑️';

    this.debug(`${emoji} Cache ${operation}: ${key}`, {
      ...context,
      operation: 'cache_operation',
      cacheStatus: operation as any
    });
  }

  // Error analysis and recommendations
  public logErrorWithRecommendation(error: Error, context: LogContext = {}): void {
    let recommendation = 'Check server logs for more details';

    if (error.message.includes('ECONNREFUSED')) {
      recommendation = 'Check if Open-Meteo API is accessible. Verify network connectivity.';
    } else if (error.message.includes('timeout')) {
      recommendation = 'API request timed out. Consider increasing timeout or checking API status.';
    } else if (error.message.includes('rate limit')) {
      recommendation = 'API rate limit exceeded. Implement exponential backoff or reduce request frequency.';
    } else if (error.message.includes('validation')) {
      recommendation = 'Input validation failed. Check parameter formats and required fields.';
    } else if (error.message.includes('coordinates')) {
      recommendation = 'Invalid coordinates provided. Ensure latitude is -90 to 90 and longitude is -180 to 180.';
    }

    this.error(`Error occurred: ${error.message}`, {
      ...context,
      recommendation,
      operation: 'error_analysis'
    }, error);
  }

  // Get current metrics
  public getMetrics(): PerformanceMetrics {
    // Calculate average response times
    const avgResponseTimes: Record<string, number> = {};
    for (const [tool, times] of Object.entries(this.metrics.responseTimes)) {
      avgResponseTimes[tool] = times.reduce((a, b) => a + b, 0) / times.length;
    }

    // Update memory usage
    this.metrics.memoryUsage = process.memoryUsage().heapUsed;

    return {
      ...this.metrics,
      responseTimes: avgResponseTimes as any
    };
  }

  // Reset metrics (useful for testing)
  public resetMetrics(): void {
    this.metrics = {
      toolCalls: {},
      responseTimes: {},
      cacheHitRate: 0,
      errorCounts: {},
      activeConnections: 0,
      memoryUsage: 0
    };
  }

  // Get formatted log summary
  public getLogSummary(): string {
    const metrics = this.getMetrics();
    const totalCalls = Object.values(metrics.toolCalls).reduce((a, b) => a + b, 0);
    const totalErrors = Object.values(metrics.errorCounts).reduce((a, b) => a + b, 0);

    return `📊 Session Summary: ${totalCalls} tool calls, ${totalErrors} errors, ${(metrics.memoryUsage / 1024 / 1024).toFixed(1)}MB memory`;
  }
}

// Singleton instance
export const logger = StructuredLogger.getInstance();

// Helper function to create correlation ID
export function createCorrelationId(): string {
  return randomUUID();
}

// Helper function to anonymize coordinates for privacy
export function anonymizeCoordinates(lat: number, lon: number): { lat: number; lon: number } {
  return {
    lat: Math.round(lat * 100) / 100, // Round to 2 decimal places (~1km precision)
    lon: Math.round(lon * 100) / 100
  };
}