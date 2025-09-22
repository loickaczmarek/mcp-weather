/**
 * 🔧 Environment Configuration
 *
 * Centralized configuration management for the MCP Weather Server.
 * Handles environment variables with validation, defaults, and type safety.
 */

export interface ServerConfig {
  // Server Configuration
  port: number;
  host: string;
  nodeEnv: 'development' | 'production' | 'test';

  // CORS Configuration
  corsOrigin: string;
  corsCredentials: boolean;

  // Logging Configuration
  logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  logFormat: 'json' | 'text';
  enableStructuredLogs: boolean;

  // Performance Configuration
  requestTimeout: number;
  maxRequestSize: string;
  enableCompression: boolean;

  // Cache Configuration
  cacheEnabled: boolean;
  defaultCacheTtl: number;
  maxCacheSize: number;

  // API Configuration
  maxResultsLimit: number;
  rateLimitEnabled: boolean;

  // Health Check Configuration
  healthCheckInterval: number;

  // Graceful Shutdown Configuration
  shutdownTimeout: number;
  keepAliveTimeout: number;
}

/**
 * Load and validate environment configuration
 */
export function loadEnvironmentConfig(): ServerConfig {
  // Helper function to parse boolean environment variables
  const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
    if (!value) return defaultValue;
    return value.toLowerCase() === 'true' || value === '1';
  };

  // Helper function to parse number with validation
  const parseNumber = (value: string | undefined, defaultValue: number, min?: number, max?: number): number => {
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) return defaultValue;
    if (min !== undefined && parsed < min) return defaultValue;
    if (max !== undefined && parsed > max) return defaultValue;
    return parsed;
  };

  const config: ServerConfig = {
    // Server Configuration
    port: parseNumber(process.env.PORT, 3000, 1, 65535),
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: (process.env.NODE_ENV as ServerConfig['nodeEnv']) || 'development',

    // CORS Configuration
    corsOrigin: process.env.CORS_ORIGIN || '*',
    corsCredentials: parseBoolean(process.env.CORS_CREDENTIALS, true),

    // Logging Configuration
    logLevel: (process.env.LOG_LEVEL as ServerConfig['logLevel']) || 'INFO',
    logFormat: (process.env.LOG_FORMAT as ServerConfig['logFormat']) || 'text',
    enableStructuredLogs: parseBoolean(process.env.ENABLE_STRUCTURED_LOGS, true),

    // Performance Configuration
    requestTimeout: parseNumber(process.env.REQUEST_TIMEOUT, 30000, 1000, 300000), // 30s default, 1s-5min range
    maxRequestSize: process.env.MAX_REQUEST_SIZE || '10mb',
    enableCompression: parseBoolean(process.env.ENABLE_COMPRESSION, true),

    // Cache Configuration
    cacheEnabled: parseBoolean(process.env.CACHE_ENABLED, true),
    defaultCacheTtl: parseNumber(process.env.DEFAULT_CACHE_TTL, 600, 60, 86400), // 10min default, 1min-1day range
    maxCacheSize: parseNumber(process.env.MAX_CACHE_SIZE, 1000, 10, 10000), // 1000 entries default

    // API Configuration
    maxResultsLimit: parseNumber(process.env.MAX_RESULTS_LIMIT, 20, 1, 100),
    rateLimitEnabled: parseBoolean(process.env.RATE_LIMIT_ENABLED, false),

    // Health Check Configuration
    healthCheckInterval: parseNumber(process.env.HEALTH_CHECK_INTERVAL, 30000, 5000, 300000), // 30s default

    // Graceful Shutdown Configuration
    shutdownTimeout: parseNumber(process.env.SHUTDOWN_TIMEOUT, 10000, 1000, 60000), // 10s default
    keepAliveTimeout: parseNumber(process.env.KEEP_ALIVE_TIMEOUT, 5000, 1000, 30000) // 5s default
  };

  // Validate configuration
  validateConfig(config);

  return config;
}

/**
 * Validate configuration values
 */
function validateConfig(config: ServerConfig): void {
  const errors: string[] = [];

  // Validate log level
  if (!['DEBUG', 'INFO', 'WARN', 'ERROR'].includes(config.logLevel)) {
    errors.push(`Invalid LOG_LEVEL: ${config.logLevel}. Must be DEBUG, INFO, WARN, or ERROR`);
  }

  // Validate node environment
  if (!['development', 'production', 'test'].includes(config.nodeEnv)) {
    errors.push(`Invalid NODE_ENV: ${config.nodeEnv}. Must be development, production, or test`);
  }

  // Validate log format
  if (!['json', 'text'].includes(config.logFormat)) {
    errors.push(`Invalid LOG_FORMAT: ${config.logFormat}. Must be json or text`);
  }

  // Validate port
  if (config.port < 1 || config.port > 65535) {
    errors.push(`Invalid PORT: ${config.port}. Must be between 1 and 65535`);
  }

  if (errors.length > 0) {
    console.error('❌ Configuration validation errors:');
    errors.forEach(error => console.error(`   - ${error}`));
    process.exit(1);
  }
}

/**
 * Print configuration summary (safe for logging - no secrets)
 */
export function printConfigSummary(config: ServerConfig): void {
  console.log('🔧 Server Configuration:');
  console.log(`   Environment: ${config.nodeEnv}`);
  console.log(`   Server: ${config.host}:${config.port}`);
  console.log(`   Log Level: ${config.logLevel} (${config.logFormat})`);
  console.log(`   Cache: ${config.cacheEnabled ? 'Enabled' : 'Disabled'} (TTL: ${config.defaultCacheTtl}s)`);
  console.log(`   CORS: ${config.corsOrigin}`);
  console.log(`   Timeouts: Request ${config.requestTimeout}ms, Shutdown ${config.shutdownTimeout}ms`);
  console.log(`   Compression: ${config.enableCompression ? 'Enabled' : 'Disabled'}`);
}

/**
 * Get environment variable documentation
 */
export function getEnvironmentDocumentation(): Record<string, string> {
  return {
    // Server Configuration
    'PORT': 'Server port (default: 3000, range: 1-65535)',
    'HOST': 'Server host address (default: 0.0.0.0)',
    'NODE_ENV': 'Environment mode: development, production, test (default: development)',

    // CORS Configuration
    'CORS_ORIGIN': 'CORS allowed origins (default: *)',
    'CORS_CREDENTIALS': 'Enable CORS credentials (default: true)',

    // Logging Configuration
    'LOG_LEVEL': 'Logging level: DEBUG, INFO, WARN, ERROR (default: INFO)',
    'LOG_FORMAT': 'Log format: json, text (default: text)',
    'ENABLE_STRUCTURED_LOGS': 'Enable structured logging (default: true)',

    // Performance Configuration
    'REQUEST_TIMEOUT': 'Request timeout in ms (default: 30000, range: 1000-300000)',
    'MAX_REQUEST_SIZE': 'Maximum request body size (default: 10mb)',
    'ENABLE_COMPRESSION': 'Enable response compression (default: true)',

    // Cache Configuration
    'CACHE_ENABLED': 'Enable response caching (default: true)',
    'DEFAULT_CACHE_TTL': 'Default cache TTL in seconds (default: 600, range: 60-86400)',
    'MAX_CACHE_SIZE': 'Maximum cache entries (default: 1000, range: 10-10000)',

    // API Configuration
    'MAX_RESULTS_LIMIT': 'Maximum API results per request (default: 20, range: 1-100)',
    'RATE_LIMIT_ENABLED': 'Enable rate limiting (default: false)',

    // Health & Monitoring
    'HEALTH_CHECK_INTERVAL': 'Health check interval in ms (default: 30000)',

    // Graceful Shutdown
    'SHUTDOWN_TIMEOUT': 'Graceful shutdown timeout in ms (default: 10000)',
    'KEEP_ALIVE_TIMEOUT': 'Keep-alive timeout in ms (default: 5000)'
  };
}