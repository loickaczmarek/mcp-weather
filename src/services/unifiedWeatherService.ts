/**
 * 🌟 Service Météo Unifié - Consolidation Intelligente
 *
 * Ce service combine le meilleur de WeatherService et OptimizedWeatherService :
 * - Cache intelligent d'OptimizedWeatherService
 * - Gestion d'erreurs robuste
 * - Interface unifiée et type-safe
 * - Performance optimisée
 */

import {
  IWeatherService,
  IWeatherRepository,
  ICacheService,
  IValidationService,
  ILoggerService,
  IErrorHandler,
  GetCurrentWeatherRequest,
  GetForecastRequest,
  GetHourlyForecastRequest,
  WeatherEntity,
  ForecastEntity,
  WeatherData,
  Coordinates,
  WeatherConditions,
  LocationInfo
} from '../domain/interfaces.js';
import { OpenMeteoService } from './openMeteoService.js';
import { weatherCache, CacheType } from '../utils/cache.js';
import { validator } from '../middleware/validation.js';
import { logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/errorHandler.js';

// ===== ENTITÉS DU DOMAINE =====

export class WeatherEntityImpl implements WeatherEntity {
  constructor(
    public readonly location: LocationInfo,
    public readonly conditions: WeatherConditions,
    public readonly timestamp: Date = new Date()
  ) {}

  isDay(): boolean {
    return Boolean(this.conditions.is_day);
  }

  getTemperatureIn(unit: 'celsius' | 'fahrenheit'): number {
    if (unit === 'fahrenheit') {
      return (this.conditions.temperature * 9/5) + 32;
    }
    return this.conditions.temperature;
  }

  getWindSpeedIn(unit: 'kmh' | 'ms' | 'mph' | 'kn'): number {
    const kmh = this.conditions.windspeed;
    switch (unit) {
      case 'ms': return kmh / 3.6;
      case 'mph': return kmh * 0.621371;
      case 'kn': return kmh * 0.539957;
      default: return kmh;
    }
  }
}

export class ForecastEntityImpl implements ForecastEntity {
  constructor(
    public readonly location: LocationInfo,
    public readonly days: number,
    public readonly dailyForecasts: any[],
    public readonly hourlyForecasts: any[] = []
  ) {}

  getDayForecast(dayIndex: number): any | null {
    return this.dailyForecasts[dayIndex] || null;
  }

  getTemperatureRange(): { min: number; max: number } {
    const temps = this.dailyForecasts.flatMap(day => [day.temperature_min, day.temperature_max]);
    return {
      min: Math.min(...temps),
      max: Math.max(...temps)
    };
  }
}

// ===== REPOSITORY ADAPTÉ =====

export class OpenMeteoWeatherRepository implements IWeatherRepository {
  constructor(private openMeteoService: OpenMeteoService) {}

  async fetchCurrentWeather(coordinates: Coordinates, options: any = {}): Promise<WeatherData> {
    const params = {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      timezone: options.timezone || 'auto',
      temperature_unit: options.temperature_unit || 'celsius',
      wind_speed_unit: options.wind_speed_unit || 'kmh',
      precipitation_unit: options.precipitation_unit || 'mm'
    };

    return await this.openMeteoService.getCurrentWeather(params);
  }

  async fetchForecast(coordinates: Coordinates, options: any = {}): Promise<WeatherData> {
    const params = {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      forecast_days: options.days || 7,
      timezone: options.timezone || 'auto',
      temperature_unit: options.temperature_unit || 'celsius',
      daily: ['temperature_2m_max', 'temperature_2m_min', 'weather_code', 'precipitation_sum', 'wind_speed_10m_max', 'sunrise', 'sunset', 'uv_index_max'],
      ...options
    };

    return await this.openMeteoService.getForecast(params);
  }

  async fetchHourlyForecast(coordinates: Coordinates, options: any = {}): Promise<WeatherData> {
    const params = {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      forecast_days: options.forecast_days || 3,
      timezone: options.timezone || 'auto',
      temperature_unit: options.temperature_unit || 'celsius',
      hourly: ['temperature_2m', 'precipitation_probability', 'precipitation', 'wind_speed_10m', 'weather_code'],
      ...options
    };

    return await this.openMeteoService.getForecast(params);
  }

  async testConnection(): Promise<boolean> {
    return await this.openMeteoService.testConnection();
  }
}

// ===== SERVICE UNIFIÉ PRINCIPAL =====

export class UnifiedWeatherService implements IWeatherService {
  private repository: IWeatherRepository;
  private cache: ICacheService;
  private validation: IValidationService;
  private logger: ILoggerService;
  private errorHandler: IErrorHandler;

  constructor(
    repository?: IWeatherRepository,
    cache?: ICacheService,
    validation?: IValidationService,
    logger?: ILoggerService,
    errorHandler?: IErrorHandler
  ) {
    // Utiliser les implémentations existantes par défaut (backward compatibility)
    this.repository = repository || new OpenMeteoWeatherRepository(new OpenMeteoService());
    this.cache = cache || this.createCacheAdapter();
    this.validation = validation || this.createValidationAdapter();
    this.logger = logger || this.createLoggerAdapter();
    this.errorHandler = errorHandler || ErrorHandler.getInstance();
  }

  async getCurrentWeather(request: GetCurrentWeatherRequest): Promise<WeatherEntity> {
    const operation = 'getCurrentWeather';
    const startTime = Date.now();

    try {
      // Validation des coordonnées
      this.validation.validateCoordinates(request.coordinates);

      // Génération de la clé de cache
      const cacheKey = this.generateCacheKey('current', request);

      // Tentative de récupération depuis le cache
      const cached = await this.cache.get<WeatherData>(cacheKey);
      if (cached) {
        this.logger.debug('Cache hit for current weather', {
          coordinates: request.coordinates,
          cacheKey: cacheKey.substring(0, 16) + '...',
          responseTime: Date.now() - startTime
        });
        return this.mapToWeatherEntity(cached);
      }

      // Récupération depuis l'API
      this.logger.info('Fetching current weather from API', {
        coordinates: request.coordinates,
        timezone: request.timezone,
        units: {
          temperature: request.temperature_unit,
          wind: request.wind_speed_unit,
          precipitation: request.precipitation_unit
        }
      });

      const weatherData = await this.repository.fetchCurrentWeather(request.coordinates, {
        timezone: request.timezone,
        temperature_unit: request.temperature_unit,
        wind_speed_unit: request.wind_speed_unit,
        precipitation_unit: request.precipitation_unit
      });

      // Validation des données reçues
      if (!weatherData.current_weather) {
        throw this.errorHandler.createApiError(
          'No current weather data available',
          { operation, coordinates: request.coordinates }
        );
      }

      // Mise en cache
      await this.cache.set(cacheKey, weatherData, 600); // 10 minutes TTL

      // Métriques de performance
      const responseTime = Date.now() - startTime;
      this.logger.info('Current weather retrieved successfully', {
        coordinates: request.coordinates,
        responseTime,
        fromCache: false,
        temperature: weatherData.current_weather.temperature
      });

      return this.mapToWeatherEntity(weatherData);

    } catch (error) {
      const handledError = this.errorHandler.handleError(error, {
        operation,
        coordinates: request.coordinates,
        responseTime: Date.now() - startTime
      });
      throw handledError;
    }
  }

  async getForecast(request: GetForecastRequest): Promise<ForecastEntity> {
    const operation = 'getForecast';
    const startTime = Date.now();

    try {
      // Validation
      this.validation.validateCoordinates(request.coordinates);
      const validDays = this.validation.validateForecastDays(request.days || 7, 7);

      // Cache
      const cacheKey = this.generateCacheKey('forecast', { ...request, days: validDays });
      const cached = await this.cache.get<WeatherData>(cacheKey);

      if (cached) {
        this.logger.debug('Cache hit for forecast', {
          coordinates: request.coordinates,
          days: validDays,
          responseTime: Date.now() - startTime
        });
        return this.mapToForecastEntity(cached, validDays);
      }

      // API call
      this.logger.info('Fetching forecast from API', {
        coordinates: request.coordinates,
        days: validDays,
        includeHourly: request.include_hourly
      });

      const forecastData = await this.repository.fetchForecast(request.coordinates, {
        days: validDays,
        timezone: request.timezone,
        temperature_unit: request.temperature_unit,
        include_hourly: request.include_hourly
      });

      // Validation
      if (!forecastData.daily) {
        throw this.errorHandler.createApiError(
          'No forecast data available',
          { operation, coordinates: request.coordinates, days: validDays }
        );
      }

      // Cache avec TTL plus long pour les prévisions
      await this.cache.set(cacheKey, forecastData, 3600); // 60 minutes TTL

      this.logger.info('Forecast retrieved successfully', {
        coordinates: request.coordinates,
        days: validDays,
        responseTime: Date.now() - startTime,
        fromCache: false
      });

      return this.mapToForecastEntity(forecastData, validDays);

    } catch (error) {
      throw this.errorHandler.handleError(error, {
        operation,
        coordinates: request.coordinates,
        days: request.days
      });
    }
  }

  async getHourlyForecast(request: GetHourlyForecastRequest): Promise<ForecastEntity> {
    const operation = 'getHourlyForecast';
    const startTime = Date.now();

    try {
      // Validation
      this.validation.validateCoordinates(request.coordinates);
      const validDays = this.validation.validateForecastDays(request.forecast_days || 3, 16);

      // Cache
      const cacheKey = this.generateCacheKey('hourly', { ...request, forecast_days: validDays });
      const cached = await this.cache.get<WeatherData>(cacheKey);

      if (cached) {
        this.logger.debug('Cache hit for hourly forecast', {
          coordinates: request.coordinates,
          forecast_days: validDays,
          responseTime: Date.now() - startTime
        });
        return this.mapToForecastEntity(cached, validDays);
      }

      // API call
      this.logger.info('Fetching hourly forecast from API', {
        coordinates: request.coordinates,
        forecast_days: validDays
      });

      const hourlyData = await this.repository.fetchHourlyForecast(request.coordinates, {
        forecast_days: validDays,
        timezone: request.timezone,
        temperature_unit: request.temperature_unit
      });

      // Validation
      if (!hourlyData.hourly || !Object.keys(hourlyData.hourly).length) {
        throw this.errorHandler.createApiError(
          'No hourly forecast data available',
          { operation, coordinates: request.coordinates, forecast_days: validDays }
        );
      }

      // Cache avec TTL moyen
      await this.cache.set(cacheKey, hourlyData, 1800); // 30 minutes TTL

      this.logger.info('Hourly forecast retrieved successfully', {
        coordinates: request.coordinates,
        forecast_days: validDays,
        responseTime: Date.now() - startTime,
        fromCache: false
      });

      return this.mapToForecastEntity(hourlyData, validDays);

    } catch (error) {
      throw this.errorHandler.handleError(error, {
        operation,
        coordinates: request.coordinates,
        forecast_days: request.forecast_days
      });
    }
  }

  // ===== MÉTHODES PRIVÉES =====

  private generateCacheKey(type: string, request: any): string {
    const keyData = {
      type,
      lat: request.coordinates?.latitude || request.latitude,
      lng: request.coordinates?.longitude || request.longitude,
      tz: request.timezone || 'auto',
      temp_unit: request.temperature_unit || 'celsius',
      days: request.days || request.forecast_days,
      hourly: request.include_hourly || false
    };

    return weatherCache.generateKey({
      latitude: keyData.lat,
      longitude: keyData.lng,
      type: type as any,
      parameters: keyData
    });
  }

  private mapToWeatherEntity(data: WeatherData): WeatherEntity {
    if (!data.current_weather) {
      throw new Error('Invalid weather data: missing current_weather');
    }

    const location: LocationInfo = {
      latitude: data.latitude,
      longitude: data.longitude,
      timezone: data.timezone,
      timezone_abbreviation: data.timezone_abbreviation,
      elevation: data.elevation
    };

    return new WeatherEntityImpl(location, data.current_weather);
  }

  private mapToForecastEntity(data: WeatherData, days: number): ForecastEntity {
    const location: LocationInfo = {
      latitude: data.latitude,
      longitude: data.longitude,
      timezone: data.timezone,
      timezone_abbreviation: data.timezone_abbreviation,
      elevation: data.elevation
    };

    const dailyForecasts = data.daily ? this.processDailyForecasts(data.daily, days) : [];
    const hourlyForecasts = data.hourly ? this.processHourlyForecasts(data.hourly) : undefined;

    return new ForecastEntityImpl(location, days, dailyForecasts, hourlyForecasts);
  }

  private processDailyForecasts(daily: any, days: number): any[] {
    const forecasts = [];
    const maxDays = Math.min(days, daily.time?.length || 0);

    for (let i = 0; i < maxDays; i++) {
      forecasts.push({
        date: daily.time[i],
        weather_code: daily.weather_code?.[i],
        temperature_max: daily.temperature_2m_max?.[i],
        temperature_min: daily.temperature_2m_min?.[i],
        precipitation_sum: daily.precipitation_sum?.[i],
        precipitation_probability_max: daily.precipitation_probability_max?.[i],
        wind_speed_max: daily.wind_speed_10m_max?.[i],
        sunrise: daily.sunrise?.[i],
        sunset: daily.sunset?.[i],
        uv_index_max: daily.uv_index_max?.[i]
      });
    }

    return forecasts;
  }

  private processHourlyForecasts(hourly: any): any[] {
    const forecasts = [];
    const maxHours = hourly.time?.length || 0;

    for (let i = 0; i < maxHours; i++) {
      forecasts.push({
        time: hourly.time[i],
        temperature: hourly.temperature_2m?.[i],
        precipitation_probability: hourly.precipitation_probability?.[i],
        precipitation: hourly.precipitation?.[i],
        wind_speed: hourly.wind_speed_10m?.[i],
        weather_code: hourly.weather_code?.[i]
      });
    }

    return forecasts;
  }

  // ===== ADAPTATEURS POUR COMPATIBILITÉ =====

  private createCacheAdapter(): ICacheService {
    return {
      async get<T>(key: string): Promise<T | null> {
        return weatherCache.get<T>(key, CacheType.CURRENT_WEATHER) || null;
      },
      async set<T>(key: string, value: T): Promise<void> {
        weatherCache.set(key, value, CacheType.CURRENT_WEATHER);
      },
      async delete(key: string): Promise<void> {
        weatherCache.invalidate(key);
      },
      async clear(): Promise<void> {
        weatherCache.invalidate();
      },
      async invalidateByPattern(pattern: string): Promise<number> {
        return weatherCache.invalidate(pattern);
      }
    };
  }

  private createValidationAdapter(): IValidationService {
    return {
      validateCoordinates: (coords: Coordinates) => {
        validator.validateLocationData(coords.latitude, coords.longitude);
      },
      validateForecastDays: (days: number, maxDays: number) => {
        return validator.validateForecastDays(days, maxDays);
      },
      validateLocationQuery: (query: string) => {
        if (!query || query.length < 2) {
          throw new Error('Location query must be at least 2 characters long');
        }
      },
      validateTemperatureUnit: (unit: string) => {
        if (!['celsius', 'fahrenheit'].includes(unit)) {
          throw new Error('Temperature unit must be celsius or fahrenheit');
        }
      }
    };
  }

  private createLoggerAdapter(): ILoggerService {
    return {
      debug: (message: string, context?: any) => logger.debug(message, context),
      info: (message: string, context?: any) => logger.info(message, context),
      warn: (message: string, context?: any) => logger.warn(message, context),
      error: (message: string, error?: Error, context?: any) => logger.error(message, context, error)
    };
  }

  // ===== MÉTHODES UTILITAIRES =====

  async invalidateCache(coordinates?: Coordinates): Promise<number> {
    if (coordinates) {
      const pattern = `*${coordinates.latitude}_${coordinates.longitude}*`;
      return await this.cache.invalidateByPattern(pattern);
    } else {
      await this.cache.clear();
      return 0;
    }
  }

  async testConnection(): Promise<boolean> {
    return await this.repository.testConnection();
  }

  // Méthode de compatibilité pour l'interface existante
  async getCurrentWeatherLegacy(params: any): Promise<any> {
    const request: GetCurrentWeatherRequest = {
      coordinates: { latitude: params.latitude, longitude: params.longitude },
      timezone: params.timezone,
      temperature_unit: params.temperature_unit,
      wind_speed_unit: params.wind_speed_unit,
      precipitation_unit: params.precipitation_unit
    };

    const entity = await this.getCurrentWeather(request);

    // Retourner dans le format attendu par l'ancien code
    return {
      latitude: entity.location.latitude,
      longitude: entity.location.longitude,
      timezone: entity.location.timezone,
      timezone_abbreviation: entity.location.timezone_abbreviation,
      elevation: entity.location.elevation,
      current_weather: entity.conditions
    };
  }
}