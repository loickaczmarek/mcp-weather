import { Request, Response, NextFunction } from 'express';
import { logger, createCorrelationId, anonymizeCoordinates, LogContext } from '../utils/logger.js';

export interface AuditableRequest extends Request {
  correlationId?: string;
  startTime?: number;
  userId?: string;
  auditContext?: LogContext;
}

// Request tracking middleware
export function requestTrackingMiddleware(req: AuditableRequest, res: Response, next: NextFunction): void {
  req.correlationId = createCorrelationId();
  req.startTime = Date.now();

  // Extract useful context from request
  req.auditContext = {
    correlationId: req.correlationId,
    httpMethod: req.method,
    endpoint: req.path,
    userAgent: req.get('User-Agent') || 'unknown',
    ip: getClientIP(req),
    contentLength: req.get('Content-Length') || '0'
  };

  // Log incoming request
  logger.info('Incoming request', {
    ...req.auditContext,
    operation: 'request_received',
    body: shouldLogBody(req) ? sanitizeBody(req.body) : '[BODY_HIDDEN]'
  });

  // Intercept response to log completion
  const originalSend = res.send;
  const originalJson = res.json;

  res.send = function(data: any) {
    logRequestCompletion(req, res, data);
    return originalSend.call(this, data);
  };

  res.json = function(data: any) {
    logRequestCompletion(req, res, data);
    return originalJson.call(this, data);
  };

  next();
}

// Tool call audit middleware
export function toolCallAuditMiddleware(req: AuditableRequest, _res: Response, next: NextFunction): void {
  // Only audit MCP tool calls
  if (req.path !== '/mcp/call') {
    return next();
  }

  const toolName = req.body?.name;
  const args = req.body?.arguments;

  if (toolName) {
    // Create audit context for tool call
    const auditContext: LogContext = {
      ...req.auditContext,
      tool: toolName,
      operation: 'tool_call_start'
    };

    // Add tool-specific context
    if (args?.latitude && args?.longitude) {
      const anonymized = anonymizeCoordinates(args.latitude, args.longitude);
      auditContext.latitude = anonymized.lat;
      auditContext.longitude = anonymized.lon;
    }

    if (args?.location) {
      auditContext.searchLocation = typeof args.location === 'string' ?
        args.location.substring(0, 50) : '[COMPLEX_LOCATION]';
    }

    // Log tool call start
    logger.auditToolCall(toolName, auditContext);

    // Store context for completion logging
    req.auditContext = { ...req.auditContext, ...auditContext };
  }

  next();
}

// Performance monitoring middleware
export function performanceAuditMiddleware(req: AuditableRequest, res: Response, next: NextFunction): void {
  const originalEnd = res.end;

  res.end = function(...args: any[]) {
    if (req.startTime) {
      const duration = Date.now() - req.startTime;
      const operation = req.path === '/mcp/call' ?
        `tool_${req.body?.name || 'unknown'}` :
        `endpoint_${req.path.replace('/', '_')}`;

      const cacheStatus = res.get('X-Cache');
      logger.logPerformance(operation, duration, {
        ...req.auditContext,
        statusCode: res.statusCode,
        cacheStatus: cacheStatus as 'HIT' | 'MISS' | undefined
      });

      // Log slow requests with recommendations
      if (duration > 1000) {
        logger.warn('Slow request detected', {
          ...req.auditContext,
          responseTime: duration,
          recommendation: getPerformanceRecommendation(duration, req.path, req.body?.name)
        });
      }
    }

    return originalEnd.apply(this, args as any);
  };

  next();
}

// Security audit middleware
export function securityAuditMiddleware(req: AuditableRequest, _res: Response, next: NextFunction): void {
  const securityContext: LogContext = {
    ...req.auditContext,
    operation: 'security_check'
  };

  // Check for suspicious patterns
  const suspiciousPatterns = [
    /script/i,
    /<.*>/,
    /javascript:/i,
    /on\w+=/i,
    /eval\(/i,
    /document\./i
  ];

  const bodyStr = JSON.stringify(req.body || {});
  const queryStr = JSON.stringify(req.query || {});

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(bodyStr) || pattern.test(queryStr)) {
      logger.warn('Suspicious input detected', {
        ...securityContext,
        pattern: pattern.toString(),
        recommendation: 'Input contains potentially malicious content. Review and sanitize.'
      });
      break;
    }
  }

  // Check for unusual coordinate ranges
  if (req.body?.arguments) {
    const { latitude, longitude } = req.body.arguments;
    if (latitude !== undefined && (latitude < -90 || latitude > 90)) {
      logger.warn('Invalid latitude value', {
        ...securityContext,
        latitude,
        recommendation: 'Latitude must be between -90 and 90 degrees.'
      });
    }
    if (longitude !== undefined && (longitude < -180 || longitude > 180)) {
      logger.warn('Invalid longitude value', {
        ...securityContext,
        longitude,
        recommendation: 'Longitude must be between -180 and 180 degrees.'
      });
    }
  }

  next();
}

// Error audit middleware
export function errorAuditMiddleware(error: Error, req: AuditableRequest, _res: Response, next: NextFunction): void {
  logger.logErrorWithRecommendation(error, {
    ...req.auditContext,
    operation: 'error_handling',
    endpoint: req.path,
    httpMethod: req.method,
    body: shouldLogBody(req) ? sanitizeBody(req.body) : '[BODY_HIDDEN]'
  });

  next(error);
}

// Helper functions
function getClientIP(req: Request): string {
  return (
    req.get('X-Forwarded-For')?.split(',')[0] ||
    req.get('X-Real-IP') ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

function shouldLogBody(req: Request): boolean {
  // Don't log body for large payloads or sensitive endpoints
  const contentLength = parseInt(req.get('Content-Length') || '0');
  return contentLength < 10000; // 10KB limit
}

function sanitizeBody(body: any): any {
  if (!body || typeof body !== 'object') return body;

  const sanitized = { ...body };

  // Remove or mask sensitive fields
  const sensitiveFields = ['password', 'token', 'key', 'secret'];
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  // Truncate long strings
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === 'string' && value.length > 200) {
      sanitized[key] = value.substring(0, 200) + '...';
    }
  }

  return sanitized;
}

function logRequestCompletion(req: AuditableRequest, res: Response, responseData: any): void {
  if (!req.startTime || !req.correlationId) return;

  const duration = Date.now() - req.startTime;
  const responseSize = JSON.stringify(responseData || '').length;

  logger.info('Request completed', {
    ...req.auditContext,
    operation: 'request_completed',
    statusCode: res.statusCode,
    responseTime: duration,
    responseSize,
    cacheStatus: res.get('X-Cache') as 'HIT' | 'MISS' | undefined,
    success: res.statusCode < 400
  });

  // Log tool call completion for MCP calls
  if (req.path === '/mcp/call' && req.body?.name) {
    logger.auditToolCall(`${req.body.name}_completed`, {
      ...req.auditContext,
      operation: 'tool_call_completed',
      responseTime: duration,
      success: res.statusCode < 400,
      statusCode: res.statusCode
    });
  }
}

function getPerformanceRecommendation(duration: number, path: string, toolName?: string): string {
  if (duration > 5000) {
    return 'Request took over 5 seconds. Check API connectivity and consider implementing timeouts.';
  } else if (duration > 2000) {
    return 'Request took over 2 seconds. Consider caching or optimizing the request.';
  } else if (path === '/mcp/call' && toolName) {
    return `Tool ${toolName} is slower than expected. Check cache configuration and API performance.`;
  }
  return 'Request slower than expected. Monitor for patterns and consider optimizations.';
}

// Metrics collection middleware
export function metricsCollectionMiddleware(_req: AuditableRequest, res: Response, next: NextFunction): void {
  // This middleware runs after the request is processed to collect final metrics
  const originalEnd = res.end;

  res.end = function(...args: any[]) {
    // Update active connections counter
    const metrics = logger.getMetrics();
    metrics.activeConnections = Math.max(0, metrics.activeConnections - 1);

    // Log periodic metrics summary
    if (Math.random() < 0.01) { // 1% chance to log summary
      logger.info('Metrics summary', {
        operation: 'metrics_collection',
        metrics: logger.getLogSummary()
      });
    }

    return originalEnd.apply(this, args as any);
  };

  // Increment active connections
  const metrics = logger.getMetrics();
  metrics.activeConnections++;

  next();
}