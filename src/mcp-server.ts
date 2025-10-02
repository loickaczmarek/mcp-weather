/**
 * 🌤️ Enhanced MCP Weather Server - HTTP Transport Optimized
 *
 * Next-generation MCP HTTP server with unified architecture features:
 * - Dependency injection and clean architecture
 * - Advanced caching and validation
 * - Use cases and domain services
 * - Production-ready logging and monitoring
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Server } from 'http';
import { container } from './infrastructure/diContainer.js';
import { UseCaseFactory } from './application/useCases.js';
import { loadEnvironmentConfig, printConfigSummary } from './config/environment.js';
import { setupGracefulShutdown } from './utils/gracefulShutdown.js';
import {
  ILoggerService,
  IErrorHandler,
  IConfigService,
  GetCurrentWeatherRequest,
  GetForecastRequest,
  GetHourlyForecastRequest,
  GeocodeLocationRequest
} from './domain/interfaces.js';

// MCP JSON-RPC 2.0 Types
interface MCPRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: any;
  error?: MCPError;
}

interface MCPError {
  code: number;
  message: string;
  data?: any;
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

export class MCPHTTPServer {
  private app: express.Application;
  private server?: Server;
  private useCaseFactory: UseCaseFactory;
  private logger: ILoggerService;
  private errorHandler: IErrorHandler;
  private config: IConfigService;

  constructor() {
    // Chargement et validation de la configuration
    const envConfig = loadEnvironmentConfig();
    printConfigSummary(envConfig);

    console.log('\n🌤️ Initializing Enhanced MCP Weather Server...');
    console.log('━'.repeat(60));

    // Initialisation du container DI et services
    this.config = container.getConfigService();
    this.logger = container.getLoggerService();
    this.errorHandler = container.getErrorHandler();

    // Vérification du container DI
    const registeredServices = container.getRegisteredTokens();
    console.log(`📦 Services registered: ${registeredServices.length}`);
    console.log(`   - ${registeredServices.join('\n   - ')}`);

    // Test des dépendances
    this.testServiceDependencies();

    // Créer la factory des use cases
    this.useCaseFactory = new UseCaseFactory(
      container.getWeatherService(),
      container.getLocationService(),
      this.logger,
      this.errorHandler,
      container.getValidationService()
    );

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();

    this.logger.info('Enhanced MCP HTTP Server initialized', {
      operation: 'mcp_server_initialization',
      port: this.config.getPort(),
      services: container.getRegisteredTokens().length
    });
  }

  private async testServiceDependencies(): Promise<void> {
    console.log('\n🔧 Testing service dependencies...');

    // Test du service météo
    try {
      const weatherService = container.getWeatherService();
      await weatherService.getCurrentWeather({
        coordinates: { latitude: 48.8566, longitude: 2.3522 },
        temperature_unit: 'celsius'
      });
      console.log('   ✅ Weather service: Connected');
    } catch {
      console.log('   ⚠️  Weather service: Ready (API test failed)');
    }

    // Test du cache
    const cacheService = container.getCacheService();
    await cacheService.set('test', { timestamp: Date.now() }, 10);
    const cacheTest = await cacheService.get('test');
    console.log(`   ✅ Cache service: ${cacheTest ? 'Working' : 'Error'}`);

    // Test de validation
    const validationService = container.getValidationService();
    try {
      validationService.validateCoordinates({ latitude: 48.8566, longitude: 2.3522 });
      console.log('   ✅ Validation service: Working');
    } catch (error) {
      console.log(`   ❌ Validation service: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private setupMiddleware(): void {
    // CORS configuration
    this.app.use(cors({
      origin: this.config.get('corsOrigin') || '*',
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true
    }));

    // Request parsing with enhanced error handling
    this.app.use(express.json({
      limit: '10mb',
      strict: true,
      type: 'application/json'
    }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Enhanced logging middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();

      res.on('finish', () => {
        const duration = Date.now() - startTime;
        this.logger.info('Request completed', {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          userAgent: req.get('User-Agent')
        });
      });

      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '2.0.0-enhanced',
        protocol: 'MCP JSON-RPC',
        services: container.getRegisteredTokens().length,
        uptime: process.uptime()
      });
    });

    // MCP Tools listing endpoint
    this.app.get('/tools', (_req: Request, res: Response) => {
      try {
        const tools = this.getToolsDefinition();
        res.json({ tools });
      } catch (error) {
        this.handleMCPError(res, error, null);
      }
    });

    // Main MCP endpoint for tool calls
    this.app.post('/', async (req: Request, res: Response) => {
      await this.handleMCPRequest(req, res);
    });

    // Legacy MCP endpoints for compatibility
    this.app.post('/mcp', async (req: Request, res: Response) => {
      await this.handleMCPRequest(req, res);
    });

    // Cache statistics endpoint
    this.app.get('/cache/stats', (_req: Request, res: Response) => {
      try {
        const cacheService = container.getCacheService() as any;
        const stats = cacheService.getStats();
        res.json(stats);
      } catch (error) {
        this.logger.error('Cache stats error', error instanceof Error ? error : new Error(String(error)));
        res.status(500).json({ error: 'Failed to get cache statistics' });
      }
    });

    // Cache clear endpoint
    this.app.post('/cache/clear', async (_req: Request, res: Response) => {
      try {
        const cacheService = container.getCacheService() as any;
        const entriesRemoved = cacheService.clearCache();
        res.json({ entriesRemoved, message: 'Cache cleared successfully' });
      } catch (error) {
        this.logger.error('Cache clear error', error instanceof Error ? error : new Error(String(error)));
        res.status(500).json({ error: 'Failed to clear cache' });
      }
    });

    // Info endpoint
    this.app.get('/info', (_req: Request, res: Response) => {
      res.json({
        name: 'Enhanced MCP Weather Server',
        version: '2.0.0-enhanced',
        description: 'Advanced MCP weather API with unified architecture',
        protocol: 'MCP JSON-RPC 2.0',
        features: [
          'Advanced caching',
          'Input validation',
          'Clean architecture',
          'Production logging',
          'Graceful shutdown'
        ],
        endpoints: {
          health: 'GET /health',
          tools: 'GET /tools',
          call: 'POST /',
          info: 'GET /info',
          cache_stats: 'GET /cache/stats',
          cache_clear: 'POST /cache/clear'
        }
      });
    });
  }

  private async handleMCPRequest(req: Request, res: Response): Promise<void> {
    try {
      const request: MCPRequest = req.body;

      // Basic MCP request validation
      if (!request || request.jsonrpc !== "2.0") {
        this.handleMCPError(res, new Error("Invalid JSON-RPC 2.0 request"), request?.id || null);
        return;
      }

      if (!request.method) {
        this.handleMCPError(res, new Error("Method is required"), request.id ?? null);
        return;
      }

      let result: any;

      switch (request.method) {
        case 'tools/list':
          result = { tools: this.getToolsDefinition() };
          break;

        case 'tools/call':
          if (!request.params?.name) {
            throw new Error("Tool name is required");
          }
          result = await this.callTool(request.params.name, request.params.arguments || {});
          break;

        // Legacy method support
        case 'get_current_weather':
          result = await this.callTool('get_current_weather', request.params || {});
          break;

        case 'get_weather_forecast':
          result = await this.callTool('get_weather_forecast', request.params || {});
          break;

        case 'get_hourly_forecast':
          result = await this.callTool('get_hourly_forecast', request.params || {});
          break;

        case 'geocode_location':
          result = await this.callTool('geocode_location', request.params || {});
          break;

        default:
          throw new Error(`Unknown method: ${request.method}`);
      }

      const response: MCPResponse = {
        jsonrpc: "2.0",
        id: request.id || null,
        result
      };

      res.json(response);

    } catch (error) {
      this.handleMCPError(res, error, req.body?.id || null);
    }
  }

  private async callTool(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'get_current_weather':
        const currentWeatherRequest: GetCurrentWeatherRequest = {
          coordinates: {
            latitude: args.latitude,
            longitude: args.longitude
          },
          timezone: args.timezone,
          temperature_unit: args.temperature_unit,
          wind_speed_unit: args.wind_speed_unit,
          precipitation_unit: args.precipitation_unit
        };

        const useCase = this.useCaseFactory.createGetCurrentWeatherUseCase();
        const weather = await useCase.execute(currentWeatherRequest);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              latitude: weather.location.latitude,
              longitude: weather.location.longitude,
              timezone: weather.location.timezone,
              timezone_abbreviation: weather.location.timezone_abbreviation,
              elevation: weather.location.elevation,
              current_weather: weather.conditions
            }, null, 2)
          }]
        };

      case 'get_weather_forecast':
        const forecastRequest: GetForecastRequest = {
          coordinates: {
            latitude: args.latitude,
            longitude: args.longitude
          },
          days: args.days,
          timezone: args.timezone,
          temperature_unit: args.temperature_unit,
          include_hourly: args.include_hourly
        };

        const forecastUseCase = this.useCaseFactory.createGetForecastUseCase();
        const forecast = await forecastUseCase.execute(forecastRequest);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              location: forecast.location,
              forecast_days: forecast.days,
              daily_forecast: forecast.dailyForecasts,
              ...(forecast.hourlyForecasts && { hourly_forecast: forecast.hourlyForecasts })
            }, null, 2)
          }]
        };

      case 'get_hourly_forecast':
        const hourlyRequest: GetHourlyForecastRequest = {
          coordinates: {
            latitude: args.latitude,
            longitude: args.longitude
          },
          forecast_days: args.forecast_days,
          timezone: args.timezone,
          temperature_unit: args.temperature_unit
        };

        const hourlyUseCase = this.useCaseFactory.createGetHourlyForecastUseCase();
        const hourlyForecast = await hourlyUseCase.execute(hourlyRequest);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              location: hourlyForecast.location,
              forecast_days: hourlyForecast.days,
              hourly_forecast: hourlyForecast.hourlyForecasts
            }, null, 2)
          }]
        };

      case 'geocode_location':
        const geocodeRequest: GeocodeLocationRequest = {
          location: args.location,
          country: args.country,
          language: args.language,
          max_results: args.max_results
        };

        const geocodeUseCase = this.useCaseFactory.createGeocodeLocationUseCase();
        const locations = await geocodeUseCase.execute(geocodeRequest);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              results: locations.map(location => ({
                name: location.name,
                latitude: location.coordinates.latitude,
                longitude: location.coordinates.longitude,
                country: location.country,
                admin1: location.admin1,
                population: location.population
              }))
            }, null, 2)
          }]
        };

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private getToolsDefinition(): MCPTool[] {
    return [
      {
        name: 'get_current_weather',
        description: 'Get current weather conditions for any location worldwide',
        inputSchema: {
          type: 'object',
          properties: {
            latitude: { type: 'number', minimum: -90, maximum: 90 },
            longitude: { type: 'number', minimum: -180, maximum: 180 },
            timezone: { type: 'string', default: 'auto' },
            temperature_unit: { type: 'string', enum: ['celsius', 'fahrenheit'], default: 'celsius' }
          },
          required: ['latitude', 'longitude']
        }
      },
      {
        name: 'get_weather_forecast',
        description: 'Get weather forecast for multiple days',
        inputSchema: {
          type: 'object',
          properties: {
            latitude: { type: 'number', minimum: -90, maximum: 90 },
            longitude: { type: 'number', minimum: -180, maximum: 180 },
            days: { type: 'number', minimum: 1, maximum: 7, default: 7 },
            timezone: { type: 'string', default: 'auto' },
            temperature_unit: { type: 'string', enum: ['celsius', 'fahrenheit'], default: 'celsius' }
          },
          required: ['latitude', 'longitude']
        }
      },
      {
        name: 'get_hourly_forecast',
        description: 'Get hourly weather forecast',
        inputSchema: {
          type: 'object',
          properties: {
            latitude: { type: 'number', minimum: -90, maximum: 90 },
            longitude: { type: 'number', minimum: -180, maximum: 180 },
            forecast_days: { type: 'number', minimum: 1, maximum: 16, default: 3 },
            timezone: { type: 'string', default: 'auto' },
            temperature_unit: { type: 'string', enum: ['celsius', 'fahrenheit'], default: 'celsius' }
          },
          required: ['latitude', 'longitude']
        }
      },
      {
        name: 'geocode_location',
        description: 'Convert location names to geographic coordinates',
        inputSchema: {
          type: 'object',
          properties: {
            location: { type: 'string', minLength: 2, maxLength: 100 },
            country: { type: 'string' },
            language: { type: 'string', pattern: '^[a-z]{2}$', default: 'en' },
            max_results: { type: 'number', minimum: 1, maximum: 20, default: 5 }
          },
          required: ['location']
        }
      }
    ];
  }

  private handleMCPError(res: Response, error: any, id: string | number | null): void {
    this.logger.error('MCP request error', error);

    const mcpError: MCPError = {
      code: error.statusCode || error.code || -32603,
      message: error.message || 'Internal error',
      data: {
        type: error.constructor.name,
        timestamp: new Date().toISOString()
      }
    };

    const response: MCPResponse = {
      jsonrpc: "2.0",
      id,
      error: mcpError
    };

    res.status(500).json(response);
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use((_req: Request, res: Response) => {
      const response: MCPResponse = {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32601,
          message: "Method not found",
          data: { suggestion: "Use POST / for MCP calls or GET /tools for available tools" }
        }
      };
      res.status(404).json(response);
    });

    // Global error handler
    this.app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
      this.logger.error('Unhandled error', err, {
        method: req.method,
        path: req.path,
        body: req.body
      });

      const response: MCPResponse = {
        jsonrpc: "2.0",
        id: req.body?.id || null,
        error: {
          code: -32603,
          message: "Internal error",
          data: { type: err.constructor.name }
        }
      };

      res.status(500).json(response);
    });
  }

  public start(): void {
    const port = this.config.getPort();
    const host = this.config.getHost();

    this.server = this.app.listen(port, host, () => {
      this.logger.info('Enhanced MCP Weather Server started', {
        host,
        port,
        nodeEnv: this.config.get('nodeEnv'),
        protocol: 'MCP JSON-RPC 2.0'
      });

      console.log('\n🌤️ Enhanced MCP Weather Server Started');
      console.log('━'.repeat(60));
      console.log(`📍 Server: http://${host}:${port}`);
      console.log(`🏥 Health: http://${host}:${port}/health`);
      console.log(`🔧 Tools: http://${host}:${port}/tools`);
      console.log(`ℹ️  Info: http://${host}:${port}/info`);
      console.log('');
      console.log('🔧 MCP Endpoints:');
      console.log(`   Call: POST http://${host}:${port}/`);
      console.log(`   Legacy: POST http://${host}:${port}/mcp`);
      console.log('━'.repeat(60));
    });

    // Graceful shutdown
    if (this.server) {
      setupGracefulShutdown(this.server, [
        async () => {
          this.logger.info('Cleaning up resources...');
        }
      ], this.config.get('shutdownTimeout') || 10000);
    }
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.logger.info('Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}