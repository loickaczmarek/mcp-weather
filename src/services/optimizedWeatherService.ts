import { OpenMeteoService, OpenMeteoCurrentParams, OpenMeteoForecastParams } from './openMeteoService.js';
import { weatherCache, CacheType } from '../utils/cache.js';
import { OpenMeteoResponse } from '../types.js';

export interface OptimizedWeatherParams {
  latitude: number;
  longitude: number;
  timezone?: string;
  temperature_unit?: 'celsius' | 'fahrenheit';
  wind_speed_unit?: 'kmh' | 'ms' | 'mph' | 'kn';
  precipitation_unit?: 'mm' | 'inch';
}

export interface OptimizedForecastParams extends OptimizedWeatherParams {
  days?: number;
  includeHourly?: boolean;
  includeDaily?: boolean;
  forecastDays?: number;
}

export class OptimizedWeatherService {
  private openMeteoService: OpenMeteoService;

  constructor() {
    this.openMeteoService = new OpenMeteoService();
  }

  async getCurrentWeather(params: OptimizedWeatherParams): Promise<OpenMeteoResponse> {
    // Generate cache key
    const cacheKey = weatherCache.generateKey({
      latitude: params.latitude,
      longitude: params.longitude,
      type: CacheType.CURRENT_WEATHER,
      parameters: {
        timezone: params.timezone,
        temperature_unit: params.temperature_unit,
        wind_speed_unit: params.wind_speed_unit,
        precipitation_unit: params.precipitation_unit
      }
    });

    // Try cache first
    const cached = weatherCache.get<OpenMeteoResponse>(cacheKey, CacheType.CURRENT_WEATHER);
    if (cached) {
      return cached;
    }

    console.log(`🌤️  Fetching current weather from API for: ${params.latitude}, ${params.longitude}`);

    // Optimized parameters for current weather
    const optimizedParams: OpenMeteoCurrentParams = {
      latitude: params.latitude,
      longitude: params.longitude,
      timezone: params.timezone || 'auto',
      temperature_unit: params.temperature_unit || 'celsius',
      wind_speed_unit: params.wind_speed_unit || 'kmh',
      precipitation_unit: params.precipitation_unit || 'mm'
    };

    const response = await this.openMeteoService.getCurrentWeather(optimizedParams);

    // Cache the response
    weatherCache.set(cacheKey, response, CacheType.CURRENT_WEATHER);

    return response;
  }

  async getForecast(params: OptimizedForecastParams): Promise<OpenMeteoResponse> {
    const days = Math.min(params.days || 7, 7);

    // Generate cache key
    const cacheKey = weatherCache.generateKey({
      latitude: params.latitude,
      longitude: params.longitude,
      type: CacheType.FORECAST,
      parameters: {
        days,
        timezone: params.timezone,
        temperature_unit: params.temperature_unit,
        includeDaily: params.includeDaily,
        includeHourly: params.includeHourly
      }
    });

    // Try cache first
    const cached = weatherCache.get<OpenMeteoResponse>(cacheKey, CacheType.FORECAST);
    if (cached) {
      return cached;
    }

    console.log(`📅 Fetching ${days}-day forecast from API for: ${params.latitude}, ${params.longitude}`);

    // Optimized parameters - only request what we need
    const optimizedParams: OpenMeteoForecastParams = {
      latitude: params.latitude,
      longitude: params.longitude,
      timezone: params.timezone || 'auto',
      temperature_unit: params.temperature_unit || 'celsius',
      wind_speed_unit: params.wind_speed_unit || 'kmh',
      precipitation_unit: params.precipitation_unit || 'mm',
      forecast_days: days
    };

    // Add daily parameters if needed
    if (params.includeDaily !== false) {
      optimizedParams.daily = this.getOptimizedDailyParams();
    }

    // Add hourly parameters if explicitly requested
    if (params.includeHourly) {
      optimizedParams.hourly = this.getOptimizedHourlyParams();
    }

    const response = await this.openMeteoService.getForecast(optimizedParams);

    // Cache the response
    weatherCache.set(cacheKey, response, CacheType.FORECAST);

    return response;
  }

  async getHourlyForecast(params: OptimizedForecastParams): Promise<OpenMeteoResponse> {
    const days = Math.min(params.forecastDays || 3, 16);

    // Generate cache key
    const cacheKey = weatherCache.generateKey({
      latitude: params.latitude,
      longitude: params.longitude,
      type: CacheType.HOURLY_FORECAST,
      parameters: {
        forecast_days: days,
        timezone: params.timezone,
        temperature_unit: params.temperature_unit
      }
    });

    // Try cache first
    const cached = weatherCache.get<OpenMeteoResponse>(cacheKey, CacheType.HOURLY_FORECAST);
    if (cached) {
      return cached;
    }

    console.log(`⏰ Fetching ${days}-day hourly forecast from API for: ${params.latitude}, ${params.longitude}`);

    // Optimized parameters for hourly forecast
    const optimizedParams: OpenMeteoForecastParams = {
      latitude: params.latitude,
      longitude: params.longitude,
      timezone: params.timezone || 'auto',
      temperature_unit: params.temperature_unit || 'celsius',
      wind_speed_unit: params.wind_speed_unit || 'kmh',
      precipitation_unit: params.precipitation_unit || 'mm',
      forecast_days: days,
      hourly: this.getOptimizedHourlyParams()
    };

    const response = await this.openMeteoService.getForecast(optimizedParams);

    // Cache the response
    weatherCache.set(cacheKey, response, CacheType.HOURLY_FORECAST);

    return response;
  }

  private getOptimizedDailyParams(): string[] {
    // Minimal set of daily parameters that are most commonly needed
    return [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'sunrise',
      'sunset',
      'precipitation_sum',
      'precipitation_probability_max',
      'wind_speed_10m_max',
      'wind_direction_10m_dominant'
    ];
  }

  private getOptimizedHourlyParams(): string[] {
    // Minimal set of hourly parameters that are most commonly needed
    return [
      'temperature_2m',
      'relative_humidity_2m',
      'precipitation_probability',
      'precipitation',
      'weather_code',
      'wind_speed_10m',
      'wind_direction_10m'
    ];
  }

  async prefetchWeather(locations: Array<{ latitude: number; longitude: number }>): Promise<void> {
    console.log(`🔥 Prefetching weather for ${locations.length} locations`);

    const promises = locations.map(async (location) => {
      try {
        // Prefetch current weather and basic forecast
        await Promise.all([
          this.getCurrentWeather(location),
          this.getForecast({ ...location, days: 3, includeHourly: false })
        ]);
      } catch (error) {
        console.warn(`⚠️  Failed to prefetch weather for ${location.latitude}, ${location.longitude}:`, error);
      }
    });

    await Promise.allSettled(promises);
    console.log(`✅ Prefetch completed for ${locations.length} locations`);
  }

  invalidateCache(latitude?: number, longitude?: number): number {
    if (latitude !== undefined && longitude !== undefined) {
      return weatherCache.invalidateByLocation(latitude, longitude);
    }

    return weatherCache.invalidate();
  }

  getCacheStats() {
    return weatherCache.getDetailedStats();
  }

  // Batch request optimization
  async getBatchWeather(
    locations: Array<{ latitude: number; longitude: number; timezone?: string }>
  ): Promise<Array<{ location: { latitude: number; longitude: number }; weather: OpenMeteoResponse | null }>> {
    console.log(`📦 Batch weather request for ${locations.length} locations`);

    const results = await Promise.allSettled(
      locations.map(async (location) => {
        try {
          const weather = await this.getCurrentWeather(location);
          return { location, weather };
        } catch (error) {
          console.warn(`⚠️  Failed to get weather for ${location.latitude}, ${location.longitude}:`, error);
          return { location, weather: null };
        }
      })
    );

    return results.map(result =>
      result.status === 'fulfilled' ? result.value : { location: { latitude: 0, longitude: 0 }, weather: null }
    ).filter(result => result.location.latitude !== 0 || result.location.longitude !== 0);
  }

  // Smart caching based on usage patterns
  async getSmartForecast(params: OptimizedWeatherParams & { requestType?: 'basic' | 'detailed' | 'extended' }): Promise<OpenMeteoResponse> {
    const requestType = params.requestType || 'basic';

    switch (requestType) {
      case 'basic':
        // Quick 3-day forecast with minimal data
        return this.getForecast({
          ...params,
          days: 3,
          includeHourly: false,
          includeDaily: true
        });

      case 'detailed':
        // 7-day forecast with hourly data for first 2 days
        const forecast = await this.getForecast({
          ...params,
          days: 7,
          includeHourly: false,
          includeDaily: true
        });

        // Get hourly data for first 2 days separately (different cache)
        const hourly = await this.getHourlyForecast({
          ...params,
          forecastDays: 2
        });

        // Merge hourly data into forecast
        if (hourly.hourly && forecast.daily) {
          forecast.hourly = hourly.hourly;
        }

        return forecast;

      case 'extended':
        // Maximum available forecast data
        return this.getForecast({
          ...params,
          days: 7,
          includeHourly: true,
          includeDaily: true
        });

      default:
        return this.getForecast(params);
    }
  }

  // Performance monitoring
  async measurePerformance<T>(operation: string, fn: () => Promise<T>): Promise<{ result: T; timing: number; fromCache: boolean }> {
    const start = Date.now();
    const result = await fn();
    const timing = Date.now() - start;

    // Simple heuristic: very fast responses likely came from cache
    const fromCache = timing < 50;

    console.log(`⏱️  ${operation}: ${timing}ms ${fromCache ? '(cached)' : '(API)'}`);

    return { result, timing, fromCache };
  }
}