import { Request, Response, NextFunction } from 'express';
import { weatherCache, CacheType, CacheKeyParams } from '../utils/cache.js';

export interface CacheableRequest extends Request {
  cacheKey?: string;
  cacheType?: CacheType;
  cacheParams?: CacheKeyParams;
  startTime?: number;
}

export interface CacheOptions {
  type: CacheType;
  keyGenerator: (req: CacheableRequest) => CacheKeyParams | null;
  skipCache?: (req: CacheableRequest) => boolean;
  skipStore?: (req: CacheableRequest, data: any) => boolean;
}

export function createCacheMiddleware(options: CacheOptions) {
  return async (req: CacheableRequest, res: Response, next: NextFunction) => {
    req.startTime = Date.now();

    // Skip cache if specified
    if (options.skipCache && options.skipCache(req)) {
      return next();
    }

    // Generate cache parameters
    const cacheParams = options.keyGenerator(req);
    if (!cacheParams) {
      return next();
    }

    req.cacheType = options.type;
    req.cacheParams = cacheParams;
    req.cacheKey = weatherCache.generateKey(cacheParams);

    // Try to get from cache
    const cachedData = weatherCache.get(req.cacheKey, options.type);
    if (cachedData) {
      const responseTime = Date.now() - req.startTime;

      // Set cache headers
      setCacheHeaders(res, options.type, true);

      // Add performance headers
      res.set('X-Cache', 'HIT');
      res.set('X-Response-Time', `${responseTime}ms`);
      res.set('X-Cache-Key', req.cacheKey.slice(0, 32) + '...');

      console.log(`⚡ Cache hit for ${req.path} (${responseTime}ms)`);

      return res.json(cachedData);
    }

    // Cache miss - continue to handler and cache the response
    res.set('X-Cache', 'MISS');

    // Intercept the response to cache it
    const originalJson = res.json;
    res.json = function(data: any) {
      const responseTime = Date.now() - req.startTime!;

      // Store in cache if not skipped
      if (!options.skipStore || !options.skipStore(req, data)) {
        if (req.cacheKey && req.cacheType) {
          weatherCache.set(req.cacheKey, data, req.cacheType);
        }
      }

      // Set cache headers
      setCacheHeaders(res, options.type, false);

      // Add performance headers
      res.set('X-Response-Time', `${responseTime}ms`);
      if (req.cacheKey) {
        res.set('X-Cache-Key', req.cacheKey.slice(0, 32) + '...');
      }

      console.log(`🔥 Cache miss for ${req.path} (${responseTime}ms) - stored`);

      return originalJson.call(this, data);
    };

    next();
  };
}

function setCacheHeaders(res: Response, type: CacheType, fromCache: boolean): void {
  let maxAge: number;
  let staleWhileRevalidate: number;

  switch (type) {
    case CacheType.CURRENT_WEATHER:
      maxAge = 300; // 5 minutes for clients
      staleWhileRevalidate = 600; // 10 minutes stale-while-revalidate
      break;

    case CacheType.FORECAST:
      maxAge = 1800; // 30 minutes for clients
      staleWhileRevalidate = 3600; // 1 hour stale-while-revalidate
      break;

    case CacheType.HOURLY_FORECAST:
      maxAge = 900; // 15 minutes for clients
      staleWhileRevalidate = 1800; // 30 minutes stale-while-revalidate
      break;

    case CacheType.GEOCODING:
      maxAge = 3600; // 1 hour for clients
      staleWhileRevalidate = 7200; // 2 hours stale-while-revalidate
      break;

    default:
      maxAge = 300;
      staleWhileRevalidate = 600;
  }

  // Set HTTP cache headers
  res.set('Cache-Control', `public, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`);
  res.set('ETag', generateETag(type, fromCache));

  // Add Last-Modified for better caching
  const lastModified = fromCache ?
    new Date(Date.now() - (maxAge * 1000 / 2)) : // Estimate for cached data
    new Date();

  res.set('Last-Modified', lastModified.toUTCString());

  // Add Vary header for content negotiation
  res.set('Vary', 'Accept, Accept-Encoding');
}

function generateETag(type: CacheType, fromCache: boolean): string {
  const timestamp = Math.floor(Date.now() / 60000); // Change every minute
  const source = fromCache ? 'cache' : 'fresh';
  return `"${type}-${timestamp}-${source}"`;
}

// Specific middleware factories for each endpoint
export const currentWeatherCache = createCacheMiddleware({
  type: CacheType.CURRENT_WEATHER,
  keyGenerator: (req: CacheableRequest) => {
    const args = req.body?.arguments;
    if (!args?.latitude || !args?.longitude) return null;

    return {
      latitude: args.latitude,
      longitude: args.longitude,
      type: CacheType.CURRENT_WEATHER,
      parameters: {
        timezone: args.timezone,
        temperature_unit: args.temperature_unit,
        wind_speed_unit: args.wind_speed_unit,
        precipitation_unit: args.precipitation_unit
      }
    };
  }
});

export const forecastCache = createCacheMiddleware({
  type: CacheType.FORECAST,
  keyGenerator: (req: CacheableRequest) => {
    const args = req.body?.arguments;
    if (!args?.latitude || !args?.longitude) return null;

    return {
      latitude: args.latitude,
      longitude: args.longitude,
      type: CacheType.FORECAST,
      parameters: {
        days: args.days || 7,
        timezone: args.timezone,
        temperature_unit: args.temperature_unit
      }
    };
  }
});

export const hourlyForecastCache = createCacheMiddleware({
  type: CacheType.HOURLY_FORECAST,
  keyGenerator: (req: CacheableRequest) => {
    const args = req.body?.arguments;
    if (!args?.latitude || !args?.longitude) return null;

    return {
      latitude: args.latitude,
      longitude: args.longitude,
      type: CacheType.HOURLY_FORECAST,
      parameters: {
        forecast_days: args.forecast_days || 3,
        timezone: args.timezone,
        temperature_unit: args.temperature_unit
      }
    };
  }
});

export const geocodingCache = createCacheMiddleware({
  type: CacheType.GEOCODING,
  keyGenerator: (req: CacheableRequest) => {
    const args = req.body?.arguments;
    if (!args?.location) return null;

    // For geocoding, we use location name as "coordinates"
    return {
      latitude: 0,
      longitude: 0,
      type: CacheType.GEOCODING,
      parameters: {
        location: args.location.toLowerCase(),
        country: args.country?.toLowerCase(),
        language: args.language || 'en',
        max_results: args.max_results || 5
      }
    };
  }
});

// Default export function to satisfy TypeScript
export default function cacheMiddleware() {
  return (_req: Request, _res: Response, next: NextFunction) => {
    next();
  };
}

// Cache invalidation middleware
export function cacheInvalidationMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Add cache invalidation endpoints
  if (req.path === '/cache/clear') {
    const count = weatherCache.invalidate();
    res.json({
      message: 'Cache cleared',
      entriesRemoved: count,
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (req.path === '/cache/stats') {
    const stats = weatherCache.getDetailedStats();
    res.json({
      ...stats,
      timestamp: new Date().toISOString()
    });
    return;
  }

  next();
}

// Performance monitoring middleware
export function performanceMiddleware(req: CacheableRequest, res: Response, next: NextFunction) {
  req.startTime = Date.now();

  const originalSend = res.send;
  res.send = function(data: any) {
    const responseTime = Date.now() - req.startTime!;

    // Log slow requests
    if (responseTime > 1000) {
      console.warn(`🐌 Slow request: ${req.method} ${req.path} took ${responseTime}ms`);
    }

    // Add server timing header
    res.set('Server-Timing', `total;dur=${responseTime}`);

    return originalSend.call(this, data);
  };

  next();
}

// Compression middleware for large responses
export function compressionHints(req: Request, res: Response, next: NextFunction) {
  // Hint that large forecast responses should be compressed
  if (req.path.includes('forecast') || req.path.includes('geocode')) {
    res.set('X-Compress-Hint', 'true');
  }

  next();
}