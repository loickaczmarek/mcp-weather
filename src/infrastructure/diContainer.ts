/**
 * 🏗️ Conteneur d'Injection de Dépendances
 *
 * Gère la création et l'injection des dépendances pour découpler les composants
 * et améliorer la testabilité du système.
 */

import {
  IWeatherService,
  ILocationService,
  IWeatherRepository,
  ILocationRepository,
  ICacheService,
  IValidationService,
  ILoggerService,
  IErrorHandler,
  IConfigService,
  IServiceFactory
} from '../domain/interfaces.js';

import { UnifiedWeatherService, OpenMeteoWeatherRepository } from '../services/unifiedWeatherService.js';
import { GeocodingService } from '../services/geocodingService.js';
import { OpenMeteoService } from '../services/openMeteoService.js';
import { weatherCache } from '../utils/cache.js';
import { validator } from '../middleware/validation.js';
import { logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/errorHandler.js';
import { loadEnvironmentConfig } from '../config/environment.js';

// ===== TYPES DE TOKENS =====

export const TOKENS = {
  // Services principaux
  WEATHER_SERVICE: 'WeatherService',
  LOCATION_SERVICE: 'LocationService',

  // Repositories
  WEATHER_REPOSITORY: 'WeatherRepository',
  LOCATION_REPOSITORY: 'LocationRepository',

  // Infrastructure
  CACHE_SERVICE: 'CacheService',
  VALIDATION_SERVICE: 'ValidationService',
  LOGGER_SERVICE: 'LoggerService',
  ERROR_HANDLER: 'ErrorHandler',
  CONFIG_SERVICE: 'ConfigService',

  // Services externes
  OPENMETEO_SERVICE: 'OpenMeteoService',

  // Factory
  SERVICE_FACTORY: 'ServiceFactory'
} as const;

export type Token = typeof TOKENS[keyof typeof TOKENS];

// ===== CONTENEUR D'INJECTION =====

export class DIContainer {
  private services = new Map<Token, any>();
  private factories = new Map<Token, () => any>();
  private singletons = new Set<Token>();

  constructor() {
    this.registerDefaultServices();
  }

  // ===== ENREGISTREMENT =====

  register<T>(token: Token, factory: () => T, singleton: boolean = true): void {
    this.factories.set(token, factory);
    if (singleton) {
      this.singletons.add(token);
    }
  }

  registerInstance<T>(token: Token, instance: T): void {
    this.services.set(token, instance);
  }

  // ===== RÉSOLUTION =====

  resolve<T>(token: Token): T {
    // Si instance déjà créée et singleton
    if (this.services.has(token) && this.singletons.has(token)) {
      return this.services.get(token);
    }

    // Créer nouvelle instance
    const factory = this.factories.get(token);
    if (!factory) {
      throw new Error(`Service not registered: ${token}`);
    }

    const instance = factory();

    // Stocker si singleton
    if (this.singletons.has(token)) {
      this.services.set(token, instance);
    }

    return instance;
  }

  // ===== MÉTHODES DE CONVENANCE =====

  getWeatherService(): IWeatherService {
    return this.resolve<IWeatherService>(TOKENS.WEATHER_SERVICE);
  }

  getLocationService(): ILocationService {
    return this.resolve<ILocationService>(TOKENS.LOCATION_SERVICE);
  }

  getCacheService(): ICacheService {
    return this.resolve<ICacheService>(TOKENS.CACHE_SERVICE);
  }

  getValidationService(): IValidationService {
    return this.resolve<IValidationService>(TOKENS.VALIDATION_SERVICE);
  }

  getLoggerService(): ILoggerService {
    return this.resolve<ILoggerService>(TOKENS.LOGGER_SERVICE);
  }

  getErrorHandler(): IErrorHandler {
    return this.resolve<IErrorHandler>(TOKENS.ERROR_HANDLER);
  }

  getConfigService(): IConfigService {
    return this.resolve<IConfigService>(TOKENS.CONFIG_SERVICE);
  }

  // ===== CONFIGURATION PAR DÉFAUT =====

  private registerDefaultServices(): void {
    // Configuration
    this.register(TOKENS.CONFIG_SERVICE, () => this.createConfigService());

    // Services d'infrastructure
    this.register(TOKENS.LOGGER_SERVICE, () => this.createLoggerService());
    this.register(TOKENS.ERROR_HANDLER, () => this.createErrorHandler());
    this.register(TOKENS.CACHE_SERVICE, () => this.createCacheService());
    this.register(TOKENS.VALIDATION_SERVICE, () => this.createValidationService());

    // Services externes
    this.register(TOKENS.OPENMETEO_SERVICE, () => new OpenMeteoService());

    // Repositories
    this.register(TOKENS.WEATHER_REPOSITORY, () =>
      new OpenMeteoWeatherRepository(
        this.resolve(TOKENS.OPENMETEO_SERVICE)
      )
    );

    this.register(TOKENS.LOCATION_REPOSITORY, () =>
      new GeocodingService()
    );

    // Services principaux
    this.register(TOKENS.WEATHER_SERVICE, () =>
      new UnifiedWeatherService(
        this.resolve(TOKENS.WEATHER_REPOSITORY),
        this.resolve(TOKENS.CACHE_SERVICE),
        this.resolve(TOKENS.VALIDATION_SERVICE),
        this.resolve(TOKENS.LOGGER_SERVICE),
        this.resolve(TOKENS.ERROR_HANDLER)
      )
    );

    this.register(TOKENS.LOCATION_SERVICE, () =>
      this.createLocationServiceAdapter()
    );

    // Factory
    this.register(TOKENS.SERVICE_FACTORY, () =>
      new ServiceFactory(this)
    );
  }

  // ===== FACTORIES PRIVÉES =====

  private createConfigService(): IConfigService {
    const config = loadEnvironmentConfig();

    return {
      get: (key: string) => (config as any)[key],
      getPort: () => config.port,
      getHost: () => config.host,
      getCacheEnabled: () => config.cacheEnabled,
      getLogLevel: () => config.logLevel,
      getApiTimeout: () => config.requestTimeout
    };
  }

  private createLoggerService(): ILoggerService {
    return {
      debug: (message: string, context?: any) => logger.debug(message, context),
      info: (message: string, context?: any) => logger.info(message, context),
      warn: (message: string, context?: any) => logger.warn(message, context),
      error: (message: string, error?: Error, context?: any) => logger.error(message, context, error)
    };
  }

  private createErrorHandler(): IErrorHandler {
    const handler = ErrorHandler.getInstance();
    return {
      handleError: (error: any, context?: any) => handler.handleError(error, context),
      createValidationError: (message: string, context?: any) =>
        handler.createValidationError(message, context),
      createApiError: (message: string, context?: any) =>
        handler.createApiError(message, context),
      createNotFoundError: (message: string, context?: any) =>
        handler.createNotFoundError(message, context)
    };
  }

  private createCacheService(): ICacheService & { getStats(): any; clearCache(): number } {
    return {
      async get<T>(key: string): Promise<T | null> {
        return weatherCache.get<T>(key, 'current_weather' as any) || null;
      },
      async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
        weatherCache.set(key, value, 'current_weather' as any);
      },
      async delete(key: string): Promise<void> {
        weatherCache.invalidate(key);
      },
      async clear(): Promise<void> {
        weatherCache.invalidate();
      },
      async invalidateByPattern(pattern: string): Promise<number> {
        return weatherCache.invalidate(pattern);
      },
      getStats(): any {
        return weatherCache.getStats();
      },
      clearCache(): number {
        return weatherCache.invalidate();
      }
    };
  }

  private createValidationService(): IValidationService {
    return {
      validateCoordinates: (coords) => {
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

  private createLocationServiceAdapter(): ILocationService {
    const geocodingService = this.resolve<GeocodingService>(TOKENS.LOCATION_REPOSITORY);

    return {
      async geocodeLocation(request) {
        const results = await geocodingService.searchLocation({
          name: request.location,
          country: request.country,
          language: request.language || 'en',
          count: request.max_results || 5
        });

        // Mapper vers les entités du domaine
        return results.map(result => ({
          name: result.name,
          coordinates: { latitude: result.latitude, longitude: result.longitude },
          country: result.country,
          admin1: result.admin1,
          population: result.population,
          getDisplayName: () => `${result.name}, ${result.country}`,
          distanceFrom: (other) => {
            // Calcul simple de distance (formule haversine simplifiée)
            const lat1 = result.latitude * Math.PI / 180;
            const lat2 = other.latitude * Math.PI / 180;
            const deltaLat = (other.latitude - result.latitude) * Math.PI / 180;
            const deltaLng = (other.longitude - result.longitude) * Math.PI / 180;

            const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
                    Math.cos(lat1) * Math.cos(lat2) *
                    Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return 6371 * c; // Rayon de la Terre en km
          }
        }));
      },
      async reverseGeocode(coordinates) {
        // Pour l'instant, retourner un placeholder
        // En production, intégrer un service de reverse geocoding
        return {
          name: `Location at ${coordinates.latitude}, ${coordinates.longitude}`,
          coordinates,
          country: 'Unknown',
          getDisplayName: () => `${coordinates.latitude}, ${coordinates.longitude}`,
          distanceFrom: () => 0
        };
      }
    };
  }

  // ===== CONFIGURATION DE TEST =====

  createTestContainer(): DIContainer {
    const testContainer = new DIContainer();

    // Enregistrer des mocks pour les tests
    testContainer.register(TOKENS.CACHE_SERVICE, () => this.createMockCacheService());
    testContainer.register(TOKENS.WEATHER_REPOSITORY, () => this.createMockWeatherRepository());

    return testContainer;
  }

  private createMockCacheService(): ICacheService {
    const mockCache = new Map<string, any>();

    return {
      async get<T>(key: string): Promise<T | null> {
        return mockCache.get(key) || null;
      },
      async set<T>(key: string, value: T): Promise<void> {
        mockCache.set(key, value);
      },
      async delete(key: string): Promise<void> {
        mockCache.delete(key);
      },
      async clear(): Promise<void> {
        mockCache.clear();
      },
      async invalidateByPattern(): Promise<number> {
        mockCache.clear();
        return 0;
      }
    };
  }

  private createMockWeatherRepository(): IWeatherRepository {
    return {
      async fetchCurrentWeather() {
        return {
          latitude: 48.8566,
          longitude: 2.3522,
          timezone: 'Europe/Paris',
          timezone_abbreviation: 'CET',
          elevation: 42,
          current_weather: {
            temperature: 20,
            windspeed: 10,
            winddirection: 180,
            weathercode: 0,
            is_day: true,
            time: new Date().toISOString()
          }
        };
      },
      async fetchForecast() {
        return {
          latitude: 48.8566,
          longitude: 2.3522,
          timezone: 'Europe/Paris',
          timezone_abbreviation: 'CET',
          elevation: 42,
          daily: {
            time: ['2024-01-01', '2024-01-02'],
            temperature_2m_max: [22, 24],
            temperature_2m_min: [18, 20],
            weather_code: [0, 1]
          }
        };
      },
      async fetchHourlyForecast() {
        return {
          latitude: 48.8566,
          longitude: 2.3522,
          timezone: 'Europe/Paris',
          timezone_abbreviation: 'CET',
          elevation: 42,
          hourly: {
            time: ['2024-01-01T00:00', '2024-01-01T01:00'],
            temperature_2m: [20, 19],
            weather_code: [0, 0]
          }
        };
      },
      async testConnection() {
        return true;
      }
    };
  }

  // ===== NETTOYAGE =====

  clear(): void {
    this.services.clear();
    this.factories.clear();
    this.singletons.clear();
  }

  // ===== INSPECTION =====

  getRegisteredTokens(): Token[] {
    return Array.from(this.factories.keys());
  }

  isRegistered(token: Token): boolean {
    return this.factories.has(token);
  }

  isSingleton(token: Token): boolean {
    return this.singletons.has(token);
  }
}

// ===== SERVICE FACTORY =====

export class ServiceFactory implements IServiceFactory {
  constructor(private container: DIContainer) {}

  createWeatherService(): IWeatherService {
    return this.container.getWeatherService();
  }

  createLocationService(): ILocationService {
    return this.container.getLocationService();
  }

  createCacheService(): ICacheService {
    return this.container.getCacheService();
  }

  createValidationService(): IValidationService {
    return this.container.getValidationService();
  }

  createLoggerService(): ILoggerService {
    return this.container.getLoggerService();
  }

  createErrorHandler(): IErrorHandler {
    return this.container.getErrorHandler();
  }
}

// ===== INSTANCE GLOBALE =====

export const container = new DIContainer();

// ===== FONCTIONS UTILITAIRES =====

export function getWeatherService(): IWeatherService {
  return container.getWeatherService();
}

export function getLocationService(): ILocationService {
  return container.getLocationService();
}

export function configureDI(configurator: (container: DIContainer) => void): void {
  configurator(container);
}

export function resetDI(): void {
  container.clear();
  container['registerDefaultServices']();
}