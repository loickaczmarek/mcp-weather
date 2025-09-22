export enum ErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  API_ERROR = 'API_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  NOT_FOUND_ERROR = 'NOT_FOUND_ERROR'
}

export interface ErrorContext {
  tool?: string;
  operation?: string;
  parameters?: Record<string, any>;
  originalError?: Error;
  correlationId?: string;
}

export class WeatherError extends Error {
  public readonly type: ErrorType;
  public readonly context: ErrorContext;
  public readonly userMessage: string;
  public readonly statusCode: number;
  public readonly timestamp: Date;

  constructor(
    type: ErrorType,
    message: string,
    userMessage: string,
    statusCode: number = 500,
    context: ErrorContext = {}
  ) {
    super(message);
    this.name = 'WeatherError';
    this.type = type;
    this.userMessage = userMessage;
    this.statusCode = statusCode;
    this.context = context;
    this.timestamp = new Date();

    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, WeatherError);
    }
  }

  toJSON() {
    return {
      type: this.type,
      message: this.userMessage,
      timestamp: this.timestamp.toISOString(),
      correlationId: this.context.correlationId
    };
  }
}

export class ErrorHandler {
  private static instance: ErrorHandler;

  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  public handleError(error: any, context: ErrorContext = {}): WeatherError {
    const correlationId = this.generateCorrelationId();
    const enhancedContext = { ...context, correlationId };

    // Log the error for debugging
    this.logError(error, enhancedContext);

    if (error instanceof WeatherError) {
      return error;
    }

    // Classify and convert the error
    if (this.isValidationError(error)) {
      return new WeatherError(
        ErrorType.VALIDATION_ERROR,
        error.message,
        this.createUserFriendlyMessage(error.message, 'validation'),
        400,
        enhancedContext
      );
    }

    if (this.isNetworkError(error)) {
      return new WeatherError(
        ErrorType.NETWORK_ERROR,
        error.message,
        'Unable to connect to weather service. Please check your internet connection and try again.',
        503,
        enhancedContext
      );
    }

    if (this.isRateLimitError(error)) {
      return new WeatherError(
        ErrorType.RATE_LIMIT_ERROR,
        error.message,
        'Weather service is temporarily busy. Please try again in a few moments.',
        429,
        enhancedContext
      );
    }

    if (this.isApiError(error)) {
      return new WeatherError(
        ErrorType.API_ERROR,
        error.message,
        'Weather service is currently unavailable. Please try again later.',
        503,
        enhancedContext
      );
    }

    // Default to internal error
    return new WeatherError(
      ErrorType.INTERNAL_ERROR,
      error.message || 'Unknown error occurred',
      'An unexpected error occurred. Please try again later.',
      500,
      enhancedContext
    );
  }

  private isValidationError(error: any): boolean {
    const message = error.message?.toLowerCase() || '';
    const validationKeywords = [
      'must be',
      'required',
      'invalid',
      'between',
      'latitude',
      'longitude',
      'parameter',
      'missing'
    ];

    return validationKeywords.some(keyword => message.includes(keyword));
  }

  private isNetworkError(error: any): boolean {
    return error.code === 'ECONNABORTED' ||
           error.code === 'ENOTFOUND' ||
           error.code === 'ECONNREFUSED' ||
           error.code === 'ETIMEDOUT' ||
           error.message?.includes('timeout') ||
           error.message?.includes('network');
  }

  private isRateLimitError(error: any): boolean {
    return error.response?.status === 429 ||
           error.message?.includes('rate limit') ||
           error.message?.includes('too many requests');
  }

  private isApiError(error: any): boolean {
    const status = error.response?.status;
    return (status && status >= 500) ||
           error.message?.includes('API Error') ||
           error.message?.includes('server error');
  }

  private createUserFriendlyMessage(originalMessage: string, errorType: string): string {
    const message = originalMessage.toLowerCase();

    // Coordinate validation errors
    if (message.includes('latitude') && message.includes('between')) {
      return 'Please provide a valid latitude between -90 and 90 degrees.';
    }

    if (message.includes('longitude') && message.includes('between')) {
      return 'Please provide a valid longitude between -180 and 180 degrees.';
    }

    // Days validation errors
    if (message.includes('days') && message.includes('between')) {
      return 'Please specify a number of forecast days between 1 and 7.';
    }

    // Temperature unit errors
    if (message.includes('temperature_unit')) {
      return 'Please specify either "celsius" or "fahrenheit" for temperature unit.';
    }

    // Missing parameters
    if (message.includes('required') || message.includes('missing')) {
      return 'Required parameters are missing. Please provide latitude and longitude.';
    }

    // Generic validation message
    if (errorType === 'validation') {
      return 'Invalid input parameters. Please check your request and try again.';
    }

    return originalMessage;
  }

  private logError(error: any, context: ErrorContext): void {
    const logLevel = this.getLogLevel(error);
    const logData = {
      timestamp: new Date().toISOString(),
      correlationId: context.correlationId,
      tool: context.tool,
      operation: context.operation,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        type: error.constructor.name
      },
      context: {
        parameters: this.sanitizeParameters(context.parameters),
        originalError: error.response?.data || null
      }
    };

    switch (logLevel) {
      case 'error':
        console.error('🚨 Weather Service Error:', JSON.stringify(logData, null, 2));
        break;
      case 'warn':
        console.warn('⚠️  Weather Service Warning:', JSON.stringify(logData, null, 2));
        break;
      case 'info':
        console.info('ℹ️  Weather Service Info:', JSON.stringify(logData, null, 2));
        break;
    }
  }

  private getLogLevel(error: any): 'error' | 'warn' | 'info' {
    if (this.isValidationError(error)) {
      return 'info';
    }

    if (this.isRateLimitError(error) || this.isNetworkError(error)) {
      return 'warn';
    }

    return 'error';
  }

  private sanitizeParameters(params?: Record<string, any>): Record<string, any> {
    if (!params) return {};

    // Remove sensitive data and truncate large values
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.length > 1000) {
        sanitized[key] = `${value.substring(0, 100)}... (truncated)`;
      } else if (key.toLowerCase().includes('key') || key.toLowerCase().includes('secret')) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private generateCorrelationId(): string {
    return `weather-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  public createValidationError(message: string, context: ErrorContext = {}): WeatherError {
    return new WeatherError(
      ErrorType.VALIDATION_ERROR,
      message,
      this.createUserFriendlyMessage(message, 'validation'),
      400,
      context
    );
  }

  public createApiError(message: string, context: ErrorContext = {}): WeatherError {
    return new WeatherError(
      ErrorType.API_ERROR,
      message,
      'Weather service is currently unavailable. Please try again later.',
      503,
      context
    );
  }

  public createNetworkError(message: string, context: ErrorContext = {}): WeatherError {
    return new WeatherError(
      ErrorType.NETWORK_ERROR,
      message,
      'Unable to connect to weather service. Please check your internet connection and try again.',
      503,
      context
    );
  }
}