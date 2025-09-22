import crypto from 'crypto';

export enum CacheType {
  CURRENT_WEATHER = 'current_weather',
  FORECAST = 'forecast',
  HOURLY_FORECAST = 'hourly_forecast',
  GEOCODING = 'geocoding'
}

export interface CacheConfig {
  ttl: number; // Time to live in milliseconds
  maxSize: number; // Maximum number of entries
  cleanupInterval: number; // Cleanup interval in milliseconds
}

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccess: number;
  size?: number; // Estimated size in bytes
}

export interface CacheStats {
  hits: number;
  misses: number;
  entries: number;
  memoryUsage: number;
  hitRate: number;
  avgAccessTime: number;
}

export interface CacheKeyParams {
  latitude: number;
  longitude: number;
  type: CacheType;
  parameters?: Record<string, any>;
}

export class WeatherCache {
  private cache: Map<string, CacheEntry> = new Map();
  private stats: { hits: number; misses: number; totalAccessTime: number; accessCount: number } = {
    hits: 0,
    misses: 0,
    totalAccessTime: 0,
    accessCount: 0
  };

  private configs: Map<CacheType, CacheConfig> = new Map();
  private cleanupTimer?: NodeJS.Timeout;

  constructor() {
    this.initializeConfigs();
    this.startCleanup();
  }

  private initializeConfigs(): void {
    // Current weather: 10 minutes TTL
    this.configs.set(CacheType.CURRENT_WEATHER, {
      ttl: 10 * 60 * 1000, // 10 minutes
      maxSize: 1000,
      cleanupInterval: 5 * 60 * 1000 // 5 minutes
    });

    // Forecasts: 1 hour TTL
    this.configs.set(CacheType.FORECAST, {
      ttl: 60 * 60 * 1000, // 1 hour
      maxSize: 500,
      cleanupInterval: 15 * 60 * 1000 // 15 minutes
    });

    // Hourly forecasts: 30 minutes TTL
    this.configs.set(CacheType.HOURLY_FORECAST, {
      ttl: 30 * 60 * 1000, // 30 minutes
      maxSize: 300,
      cleanupInterval: 10 * 60 * 1000 // 10 minutes
    });

    // Geocoding: 2 hours TTL (locations don't change often)
    this.configs.set(CacheType.GEOCODING, {
      ttl: 2 * 60 * 60 * 1000, // 2 hours
      maxSize: 2000,
      cleanupInterval: 30 * 60 * 1000 // 30 minutes
    });
  }

  public generateKey(params: CacheKeyParams): string {
    // Round coordinates to 4 decimal places (~11m precision)
    const lat = Math.round(params.latitude * 10000) / 10000;
    const lon = Math.round(params.longitude * 10000) / 10000;

    // Create a deterministic parameter string
    const paramString = params.parameters ?
      Object.keys(params.parameters)
        .sort()
        .map(key => `${key}:${params.parameters![key]}`)
        .join('|') : '';

    // Create base key
    const baseKey = `${params.type}:${lat},${lon}`;

    if (paramString) {
      // Hash parameters to keep key size manageable
      const paramHash = crypto.createHash('md5').update(paramString).digest('hex').slice(0, 8);
      return `${baseKey}:${paramHash}`;
    }

    return baseKey;
  }

  public get<T>(key: string, _type: CacheType): T | null {
    const start = Date.now();

    try {
      const entry = this.cache.get(key);

      if (!entry) {
        this.stats.misses++;
        console.log(`💾 Cache MISS: ${key}`);
        return null;
      }

      const now = Date.now();

      // Check if entry has expired
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        this.stats.misses++;
        console.log(`💾 Cache EXPIRED: ${key}`);
        return null;
      }

      // Update access statistics
      entry.accessCount++;
      entry.lastAccess = now;

      this.stats.hits++;
      console.log(`💾 Cache HIT: ${key} (accessed ${entry.accessCount} times)`);

      return entry.data as T;

    } finally {
      const accessTime = Date.now() - start;
      this.stats.totalAccessTime += accessTime;
      this.stats.accessCount++;
    }
  }

  public set<T>(key: string, data: T, cacheType: CacheType): void {
    const config = this.configs.get(cacheType);
    if (!config) {
      console.error(`❌ Unknown cache type: ${cacheType}`);
      return;
    }

    const now = Date.now();
    const estimatedSize = this.estimateSize(data);

    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      ttl: config.ttl,
      accessCount: 0,
      lastAccess: now,
      size: estimatedSize
    };

    // Check if we need to make room
    this.ensureCapacity(cacheType, config);

    this.cache.set(key, entry);

    const ttlMinutes = Math.round(config.ttl / 60000);
    console.log(`💾 Cache SET: ${key} (TTL: ${ttlMinutes}min, Size: ${estimatedSize}b)`);
  }

  private ensureCapacity(type: CacheType, config: CacheConfig): void {
    const typeEntries = Array.from(this.cache.entries()).filter(([key]) =>
      key.startsWith(type + ':')
    );

    if (typeEntries.length >= config.maxSize) {
      // Remove least recently used entry of this type
      const lruEntry = typeEntries.reduce((oldest, current) => {
        const currentLastAccess = current[1].lastAccess;
        const oldestLastAccess = oldest[1].lastAccess;
        return currentLastAccess < oldestLastAccess ? current : oldest;
      });

      this.cache.delete(lruEntry[0]);
      console.log(`💾 Cache EVICTED (LRU): ${lruEntry[0]}`);
    }
  }

  private estimateSize(data: any): number {
    try {
      return new Blob([JSON.stringify(data)]).size;
    } catch {
      // Fallback estimation
      const str = JSON.stringify(data);
      return str.length * 2; // Rough estimate for UTF-16
    }
  }

  public invalidate(pattern?: string): number {
    if (!pattern) {
      const count = this.cache.size;
      this.cache.clear();
      console.log(`💾 Cache CLEARED: ${count} entries`);
      return count;
    }

    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        count++;
      }
    }

    if (count > 0) {
      console.log(`💾 Cache INVALIDATED: ${count} entries matching "${pattern}"`);
    }

    return count;
  }

  public invalidateByLocation(latitude: number, longitude: number): number {
    const lat = Math.round(latitude * 10000) / 10000;
    const lon = Math.round(longitude * 10000) / 10000;
    const locationKey = `${lat},${lon}`;

    return this.invalidate(locationKey);
  }

  public invalidateByType(type: CacheType): number {
    return this.invalidate(type + ':');
  }

  private startCleanup(): void {
    // Run cleanup every 5 minutes
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  private cleanup(): void {
    const now = Date.now();
    let expiredCount = 0;
    let totalCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      totalCount++;

      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      console.log(`🧹 Cache cleanup: removed ${expiredCount}/${totalCount} expired entries`);
    }

    // Log memory usage periodically
    if (totalCount > 0) {
      const stats = this.getStats();
      console.log(`📊 Cache stats: ${stats.entries} entries, ${(stats.memoryUsage / 1024).toFixed(1)}KB, ${(stats.hitRate * 100).toFixed(1)}% hit rate`);
    }
  }

  public getStats(): CacheStats {
    const entries = this.cache.size;
    const memoryUsage = Array.from(this.cache.values())
      .reduce((total, entry) => total + (entry.size || 0), 0);

    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    const avgAccessTime = this.stats.accessCount > 0 ?
      this.stats.totalAccessTime / this.stats.accessCount : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      entries,
      memoryUsage,
      hitRate,
      avgAccessTime
    };
  }

  public getDetailedStats(): Record<string, any> {
    const stats = this.getStats();
    const typeStats: Record<string, number> = {};

    // Count entries by type
    for (const key of this.cache.keys()) {
      const keyType = key.split(':')[0];
      if (keyType) {
        typeStats[keyType] = (typeStats[keyType] || 0) + 1;
      }
    }

    return {
      ...stats,
      typeBreakdown: typeStats,
      configs: Object.fromEntries(
        Array.from(this.configs.entries()).map(([cacheType, config]) => [
          cacheType,
          {
            ttlMinutes: config.ttl / 60000,
            maxSize: config.maxSize,
            currentSize: typeStats[cacheType] || 0
          }
        ])
      )
    };
  }

  public warmup(locations: Array<{ latitude: number; longitude: number }>): void {
    console.log(`🔥 Cache warmup requested for ${locations.length} locations`);
    // This could be implemented to pre-fetch common weather data
    // For now, just log the request
  }

  public destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.cache.clear();
    console.log('💾 Weather cache destroyed');
  }
}

// Singleton instance
export const weatherCache = new WeatherCache();