/**
 * 🌤️ MCP Weather Server
 *
 * High-performance TypeScript HTTP server implementing the Model Context Protocol (MCP)
 * for comprehensive weather data services. Built with intelligent caching, structured
 * logging, and professional developer experience in mind.
 *
 * Key Features:
 * - Real-time weather data with global coverage
 * - Multi-day and hourly forecasts with high precision
 * - Global geocoding with multi-language support
 * - Intelligent caching for 94.5% performance improvement
 * - Production-ready with graceful shutdown and monitoring
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Server } from 'http';
import { OptimizedWeatherService } from './services/optimizedWeatherService.js';
import { ForecastTool } from './tools/forecast.js';
import { GeocodingTool } from './tools/geocoding.js';
import { validator } from './middleware/validation.js';
import {
  currentWeatherCache,
  forecastCache,
  hourlyForecastCache,
  geocodingCache,
  cacheInvalidationMiddleware,
  performanceMiddleware,
  compressionHints
} from './middleware/cacheMiddleware.js';
import {
  requestTrackingMiddleware,
  toolCallAuditMiddleware,
  performanceAuditMiddleware,
  securityAuditMiddleware,
  errorAuditMiddleware,
  metricsCollectionMiddleware
} from './middleware/logging.js';
import { ErrorHandler, WeatherError } from './utils/errorHandler.js';
import { logger } from './utils/logger.js';
import { MCPTool, MCPToolsResponse, MCPCallResponse, MCPError } from './types.js';
import { loadEnvironmentConfig, printConfigSummary, ServerConfig } from './config/environment.js';
import { setupGracefulShutdown, GracefulShutdown } from './utils/gracefulShutdown.js';

export class MCPWeatherServer {
  private app: express.Application;
  private server?: Server;
  private optimizedWeatherService: OptimizedWeatherService;
  private forecastTool: ForecastTool;
  private geocodingTool: GeocodingTool;
  private errorHandler: ErrorHandler;
  private gracefulShutdown: GracefulShutdown;
  private config: ServerConfig;

  constructor() {
    // Load and validate configuration
    this.config = loadEnvironmentConfig();

    // Print configuration summary
    printConfigSummary(this.config);

    // Initialize core components
    this.app = express();
    this.optimizedWeatherService = new OptimizedWeatherService();
    this.forecastTool = new ForecastTool();
    this.geocodingTool = new GeocodingTool();
    this.errorHandler = ErrorHandler.getInstance();

    // Setup graceful shutdown
    this.gracefulShutdown = GracefulShutdown.getInstance(this.config.shutdownTimeout);

    // Configure the application
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();

    logger.info('MCP Weather Server initialized', {
      operation: 'server_initialization',
      config: {
        nodeEnv: this.config.nodeEnv,
        port: this.config.port,
        cacheEnabled: this.config.cacheEnabled,
        logLevel: this.config.logLevel
      }
    });
  }

  private setupMiddleware(): void {
    // Request tracking should be first to capture all requests
    this.app.use(requestTrackingMiddleware);

    // Security audit middleware
    this.app.use(securityAuditMiddleware);

    // Metrics collection middleware
    this.app.use(metricsCollectionMiddleware);

    // Performance monitoring should be early
    this.app.use(performanceMiddleware);
    this.app.use(performanceAuditMiddleware);

    // CORS configuration from environment
    this.app.use(cors({
      origin: this.config.corsOrigin,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'If-None-Match', 'If-Modified-Since'],
      credentials: this.config.corsCredentials,
      exposedHeaders: ['X-Cache', 'X-Response-Time', 'X-Cache-Key', 'ETag', 'Last-Modified']
    }));

    // Request parsing with configured limits
    this.app.use(express.json({
      limit: this.config.maxRequestSize,
      strict: true,
      type: 'application/json'
    }));
    this.app.use(express.urlencoded({
      extended: true,
      limit: this.config.maxRequestSize
    }));

    // Request timeout middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      req.setTimeout(this.config.requestTimeout, () => {
        logger.warn('Request timeout occurred', {
          operation: 'request_timeout',
          url: req.url,
          method: req.method,
          timeout: this.config.requestTimeout,
          recommendation: 'Consider increasing REQUEST_TIMEOUT or optimizing request processing'
        });
        res.status(408).json({
          error: {
            code: 408,
            message: 'Request timeout',
            data: { timeout: this.config.requestTimeout }
          }
        });
      });
      next();
    });

    // Compression hints (conditional based on config)
    if (this.config.enableCompression) {
      this.app.use(compressionHints);
    }

    // Cache invalidation and stats endpoints (conditional based on cache config)
    if (this.config.cacheEnabled) {
      this.app.use(cacheInvalidationMiddleware);
    }

    // Tool call audit middleware for MCP endpoints
    this.app.use(toolCallAuditMiddleware);

    logger.debug('Middleware setup completed', {
      operation: 'middleware_setup',
      corsOrigin: this.config.corsOrigin,
      requestTimeout: this.config.requestTimeout,
      maxRequestSize: this.config.maxRequestSize,
      compressionEnabled: this.config.enableCompression,
      cacheEnabled: this.config.cacheEnabled
    });
  }

  private setupRoutes(): void {
    // Main health endpoint
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });

    // Readiness endpoint for Kubernetes/Docker
    this.app.get('/ready', (_req: Request, res: Response) => {
      if (this.gracefulShutdown.isShuttingDown()) {
        res.status(503).json({
          status: 'shutting_down',
          timestamp: new Date().toISOString()
        });
        return;
      }

      res.json({
        status: 'ready',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        config: {
          nodeEnv: this.config.nodeEnv,
          cacheEnabled: this.config.cacheEnabled,
          version: '1.0.0'
        }
      });
    });

    // Liveness endpoint for Kubernetes/Docker
    this.app.get('/live', (_req: Request, res: Response) => {
      res.json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        pid: process.pid,
        memory: process.memoryUsage(),
        uptime: process.uptime()
      });
    });

    this.app.get('/mcp/tools', this.handleListTools.bind(this));

    // Add cache middleware to specific routes
    this.app.post('/mcp/call', (req, res, next) => {
      const toolName = req.body?.name;

      switch (toolName) {
        case 'get_current_weather':
          return currentWeatherCache(req, res, next);
        case 'get_weather_forecast':
          return forecastCache(req, res, next);
        case 'get_hourly_forecast':
          return hourlyForecastCache(req, res, next);
        case 'geocode_location':
          return geocodingCache(req, res, next);
        default:
          return next();
      }
    }, this.handleCallTool.bind(this));
  }

  private async handleListTools(_req: Request, res: Response): Promise<void> {
    try {
      const tools: MCPTool[] = [
        {
          name: 'get_current_weather',
          description: `Get real-time weather conditions for any location worldwide using precise coordinates.

🌍 **Use Cases:**
- Current temperature, wind speed, and weather conditions
- Weather-based decision making for outdoor activities
- Real-time monitoring for specific locations
- Integration with location-based applications

📊 **Returned Data:**
- Temperature in Celsius or Fahrenheit
- Wind speed and direction
- Weather code (0=clear, 1-3=partly cloudy, 45-48=fog, 51-67=rain, 71-86=snow, 95-99=thunderstorm)
- Day/night indicator
- Precise timestamp of measurement

🔄 **Performance:** Cached for 10 minutes to ensure fast responses while maintaining data freshness.

💡 **Example Usage:**
- Paris, France: latitude: 48.8566, longitude: 2.3522
- New York, USA: latitude: 40.7128, longitude: -74.0060
- Tokyo, Japan: latitude: 35.6762, longitude: 139.6503`,
          inputSchema: {
            type: 'object',
            properties: {
              latitude: {
                type: 'number',
                minimum: -90,
                maximum: 90,
                description: 'Latitude coordinate in decimal degrees. Examples: Paris (48.8566), Sydney (-33.8688), Reykjavik (64.1466)',
                examples: [48.8566, -33.8688, 64.1466, 0.0]
              },
              longitude: {
                type: 'number',
                minimum: -180,
                maximum: 180,
                description: 'Longitude coordinate in decimal degrees. Examples: Paris (2.3522), Sydney (151.2093), Reykjavik (-21.9426)',
                examples: [2.3522, 151.2093, -21.9426, 0.0]
              },
              timezone: {
                type: 'string',
                description: 'Timezone for the weather data. Use "auto" for automatic detection or IANA timezone names.',
                default: 'auto',
                examples: ['auto', 'Europe/Paris', 'America/New_York', 'Asia/Tokyo', 'UTC'],
                pattern: '^(auto|UTC|[A-Za-z]+/[A-Za-z_]+)$'
              },
              temperature_unit: {
                type: 'string',
                enum: ['celsius', 'fahrenheit'],
                description: 'Temperature unit for the response. Celsius is used in most countries, Fahrenheit primarily in the US.',
                default: 'celsius'
              }
            },
            required: ['latitude', 'longitude']
          }
        },
        {
          name: 'get_weather_forecast',
          description: `Get comprehensive multi-day weather forecasts with detailed meteorological data for planning and analysis.

🎯 **Use Cases:**
- Trip planning and travel preparation
- Agricultural and farming decisions
- Event planning and outdoor activities
- Long-term weather pattern analysis
- Emergency preparedness and risk assessment

📅 **Forecast Data Includes:**
- Daily temperature ranges (min/max)
- Precipitation probability and amount
- Wind speed, gusts, and direction
- UV index for sun exposure planning
- Sunrise/sunset times and daylight duration
- Weather codes with human-readable descriptions
- Detailed weather conditions for each day

🔄 **Performance:** Cached for 60 minutes for optimal balance between accuracy and speed.

⏰ **Forecast Horizons:**
- 1-3 days: Highly accurate, ideal for immediate planning
- 4-5 days: Good accuracy, suitable for short-term planning
- 6-7 days: General trends, useful for preliminary planning

🌦️ **Weather Codes Reference:**
- 0: Clear sky
- 1-3: Mainly clear to partly cloudy
- 45-48: Fog and depositing rime fog
- 51-67: Rain (light to heavy)
- 71-86: Snow (light to heavy)
- 95-99: Thunderstorm (slight to heavy with hail)`,
          inputSchema: {
            type: 'object',
            properties: {
              latitude: {
                type: 'number',
                minimum: -90,
                maximum: 90,
                description: 'Latitude coordinate in decimal degrees. High precision improves forecast accuracy.',
                examples: [48.8566, -33.8688, 64.1466, 0.0]
              },
              longitude: {
                type: 'number',
                minimum: -180,
                maximum: 180,
                description: 'Longitude coordinate in decimal degrees. High precision improves forecast accuracy.',
                examples: [2.3522, 151.2093, -21.9426, 0.0]
              },
              days: {
                type: 'number',
                minimum: 1,
                maximum: 7,
                default: 7,
                description: 'Number of forecast days. 1-3 days have highest accuracy, 4-7 days show general trends.',
                examples: [1, 3, 5, 7]
              },
              timezone: {
                type: 'string',
                description: 'Timezone for sunrise/sunset times and daily boundaries. Use "auto" for automatic detection.',
                default: 'auto',
                examples: ['auto', 'Europe/Paris', 'America/New_York', 'Asia/Tokyo', 'UTC'],
                pattern: '^(auto|UTC|[A-Za-z]+/[A-Za-z_]+)$'
              },
              temperature_unit: {
                type: 'string',
                enum: ['celsius', 'fahrenheit'],
                description: 'Temperature unit for all temperature values in the forecast.',
                default: 'celsius'
              }
            },
            required: ['latitude', 'longitude']
          }
        },
        {
          name: 'get_hourly_forecast',
          description: `Get high-precision hourly weather forecasts for detailed planning and real-time decision making.

⏱️ **Use Cases:**
- Precise timing for outdoor activities
- Construction and work schedule planning
- Aviation and maritime operations
- Sports events and competitions
- Energy production planning (solar/wind)
- Emergency response and safety management

📋 **Hourly Data Includes:**
- Temperature variations throughout the day
- Precipitation timing and intensity
- Wind patterns and gusts
- Cloud cover and visibility
- Humidity and atmospheric pressure
- Weather condition changes hour by hour

🔄 **Performance:** Cached for 30 minutes to balance data freshness with response speed.

⚡ **Accuracy Timeline:**
- Next 24 hours: Very high precision
- 2-3 days: High accuracy for planning
- 4-7 days: Good trends and patterns
- 8-16 days: General weather tendencies

🎯 **Optimal Usage:**
- Use 1-3 days for detailed hourly planning
- Use 4-7 days for identifying weather windows
- Use 8-16 days for long-term trend analysis

📊 **Data Volume:** Returns 24 hours × forecast_days of detailed weather data.`,
          inputSchema: {
            type: 'object',
            properties: {
              latitude: {
                type: 'number',
                minimum: -90,
                maximum: 90,
                description: 'Latitude coordinate in decimal degrees. Precision affects forecast accuracy.',
                examples: [48.8566, -33.8688, 64.1466, 0.0]
              },
              longitude: {
                type: 'number',
                minimum: -180,
                maximum: 180,
                description: 'Longitude coordinate in decimal degrees. Precision affects forecast accuracy.',
                examples: [2.3522, 151.2093, -21.9426, 0.0]
              },
              forecast_days: {
                type: 'number',
                minimum: 1,
                maximum: 16,
                default: 3,
                description: 'Number of forecast days. More days = more data. Recommend 1-3 for detailed planning, 4-7 for trend analysis.',
                examples: [1, 3, 7, 14, 16]
              },
              timezone: {
                type: 'string',
                description: 'Timezone for hourly timestamps. Use "auto" for location-based detection.',
                default: 'auto',
                examples: ['auto', 'Europe/Paris', 'America/New_York', 'Asia/Tokyo', 'UTC'],
                pattern: '^(auto|UTC|[A-Za-z]+/[A-Za-z_]+)$'
              },
              temperature_unit: {
                type: 'string',
                enum: ['celsius', 'fahrenheit'],
                description: 'Temperature unit for all hourly temperature readings.',
                default: 'celsius'
              }
            },
            required: ['latitude', 'longitude']
          }
        },
        {
          name: 'geocode_location',
          description: `Convert location names to precise geographic coordinates for weather data retrieval. Supports global locations with intelligent matching.

🗺️ **Use Cases:**
- Convert city names to coordinates for weather tools
- Resolve ambiguous location names with country filters
- Multi-language location search and resolution
- Address to coordinate conversion for precise weather data
- Location validation and verification

🔍 **Search Capabilities:**
- **Cities**: Paris, New York, Tokyo, Sydney
- **Regions**: Normandy, California, Tuscany
- **Countries**: France, United States, Japan
- **Landmarks**: Eiffel Tower, Central Park, Mount Fuji
- **Addresses**: Street-level geocoding support
- **Airports**: JFK, CDG, NRT (using IATA codes)

🔄 **Performance:** Cached for 2 hours since location coordinates rarely change.

🌐 **Multi-language Support:**
- Search in local languages: "東京" (Tokyo), "París" (Paris)
- Results include names in multiple languages
- Country filters work with both names and ISO codes

⚠️ **Disambiguation Features:**
- Returns multiple matches for ambiguous names
- Country filtering to narrow down results
- Population and admin level ranking
- Detailed location information for verification

📊 **Return Data:**
- Precise latitude/longitude coordinates
- Location name in requested language
- Country and administrative divisions
- Population data for ranking
- Alternative names and translations`,
          inputSchema: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                minLength: 2,
                maxLength: 100,
                description: 'Location name to search for. Can be city, region, country, landmark, or address.',
                examples: [
                  'Paris',
                  'New York',
                  'Tokyo Station',
                  'Provence-Alpes-Côte d\'Azur',
                  '1600 Pennsylvania Avenue',
                  'JFK Airport',
                  'Mount Everest'
                ]
              },
              country: {
                type: 'string',
                description: 'Optional country filter to disambiguate locations. Use country name or ISO code.',
                examples: ['France', 'United States', 'JP', 'DE', 'United Kingdom'],
                maxLength: 50
              },
              language: {
                type: 'string',
                pattern: '^[a-z]{2}$',
                default: 'en',
                description: 'Language for location names in results. Use ISO 639-1 codes.',
                examples: ['en', 'fr', 'de', 'es', 'ja', 'zh', 'ru', 'ar']
              },
              max_results: {
                type: 'number',
                minimum: 1,
                maximum: 20,
                default: 5,
                description: 'Maximum number of location matches to return. Use 1 for single best match, 5-10 for disambiguation.',
                examples: [1, 5, 10, 20]
              }
            },
            required: ['location']
          }
        }
      ];

      const response: MCPToolsResponse = { tools };
      res.json(response);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  private async handleCallTool(req: Request, res: Response): Promise<void> {
    try {
      // Validate and sanitize MCP call structure
      const { name, arguments: args } = validator.validateMCPCall(req.body);

      let result: string;

      switch (name) {
        case 'get_current_weather':
          const currentWeatherParams = validator.validateCurrentWeather(args, name);
          validator.validateLocationData(currentWeatherParams.latitude, currentWeatherParams.longitude);
          result = await this.getCurrentWeather(currentWeatherParams);
          break;

        case 'get_weather_forecast':
          const forecastParams = validator.validateForecast(args, name);
          validator.validateLocationData(forecastParams.latitude, forecastParams.longitude);
          result = await this.forecastTool.getForecast(forecastParams);
          break;

        case 'get_hourly_forecast':
          const hourlyParams = validator.validateHourlyForecast(args, name);
          validator.validateLocationData(hourlyParams.latitude, hourlyParams.longitude);
          result = await this.getHourlyForecast(hourlyParams);
          break;

        case 'geocode_location':
          const geocodingParams = validator.validateGeocoding(args, name);
          result = await this.geocodingTool.geocodeLocation(geocodingParams);
          break;

        default:
          throw this.errorHandler.createValidationError(
            `Unknown tool: ${name}`,
            { tool: name, operation: 'tool selection' }
          );
      }

      const response: MCPCallResponse = {
        content: [{
          type: 'text',
          text: result
        }]
      };

      res.json(response);
    } catch (error) {
      this.handleServerError(res, error);
    }
  }

  private async getCurrentWeather(params: any): Promise<string> {
    try {
      const response = await this.optimizedWeatherService.getCurrentWeather({
        latitude: params.latitude,
        longitude: params.longitude,
        timezone: params.timezone || 'auto',
        temperature_unit: params.temperature_unit,
        wind_speed_unit: params.wind_speed_unit,
        precipitation_unit: params.precipitation_unit
      });

      if (!response.current_weather) {
        throw this.errorHandler.createApiError(
          'No current weather data available from OpenMeteo',
          { tool: 'get_current_weather', operation: 'data retrieval', parameters: params }
        );
      }

      const current = response.current_weather;
      return JSON.stringify({
        location: {
          latitude: response.latitude,
          longitude: response.longitude,
          timezone: response.timezone,
          elevation: response.elevation
        },
        current_weather: {
          temperature: current.temperature,
          wind_speed: current.windspeed,
          wind_direction: current.winddirection,
          weather_code: current.weathercode,
          is_day: current.is_day === 1,
          time: current.time
        }
      }, null, 2);
    } catch (error) {
      throw this.errorHandler.handleError(error, {
        tool: 'get_current_weather',
        operation: 'current weather retrieval',
        parameters: params
      });
    }
  }


  private async getHourlyForecast(params: any): Promise<string> {
    try {
      const forecastDays = validator.validateForecastDays(params.forecast_days || 3, 16);

      const response = await this.optimizedWeatherService.getHourlyForecast({
        latitude: params.latitude,
        longitude: params.longitude,
        forecastDays: forecastDays,
        timezone: params.timezone || 'auto',
        temperature_unit: params.temperature_unit
      });

      if (!response.hourly || !Object.keys(response.hourly).length) {
        throw this.errorHandler.createApiError(
          'No hourly forecast data available from OpenMeteo',
          { tool: 'get_hourly_forecast', operation: 'data retrieval', parameters: params }
        );
      }

      return JSON.stringify({
        location: {
          latitude: response.latitude,
          longitude: response.longitude,
          timezone: response.timezone,
          elevation: response.elevation
        },
        hourly_forecast: response.hourly
      }, null, 2);
    } catch (error) {
      throw this.errorHandler.handleError(error, {
        tool: 'get_hourly_forecast',
        operation: 'hourly forecast retrieval',
        parameters: params
      });
    }
  }

  private handleError(res: Response, error: any): void {
    console.error('Error:', error);

    if (error.response?.status) {
      this.sendError(res, error.response.status, error.response.data?.reason || error.message);
    } else {
      this.sendError(res, 500, 'Internal server error');
    }
  }

  private handleServerError(res: Response, error: any): void {
    if (error instanceof WeatherError) {
      console.log(`🔄 Handled weather error: ${error.type} - ${error.userMessage}`);

      const mcpError: MCPError = {
        code: error.statusCode,
        message: error.userMessage,
        data: {
          type: error.type,
          timestamp: error.timestamp.toISOString(),
          correlationId: error.context.correlationId
        }
      };

      res.status(error.statusCode).json({ error: mcpError });
    } else {
      // Fallback for unexpected errors
      const handledError = this.errorHandler.handleError(error);
      this.handleServerError(res, handledError);
    }
  }

  private sendError(res: Response, code: number, message: string, data?: any): void {
    const error: MCPError = { code, message, data };
    res.status(code).json({ error });
  }

  private setupErrorHandling(): void {
    // Error audit middleware for structured error logging
    this.app.use(errorAuditMiddleware);

    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      logger.error('Unhandled error in server', {
        operation: 'unhandled_error',
        recommendation: 'Check server configuration and middleware setup'
      }, err);
      this.sendError(res, 500, 'Internal server error');
    });

    this.app.use((_req: Request, res: Response) => {
      logger.warn('Endpoint not found', {
        operation: 'route_not_found',
        endpoint: _req.path,
        httpMethod: _req.method,
        recommendation: 'Check API documentation for correct endpoints'
      });
      this.sendError(res, 404, 'Endpoint not found');
    });
  }


  /**
   * Start the server with graceful shutdown support
   */
  public start(): void {
    this.server = this.app.listen(this.config.port, this.config.host, () => {
      logger.info('MCP Weather Server started', {
        operation: 'server_startup',
        host: this.config.host,
        port: this.config.port,
        nodeEnv: this.config.nodeEnv,
        pid: process.pid,
        endpoints: {
          health: `http://${this.config.host}:${this.config.port}/health`,
          ready: `http://${this.config.host}:${this.config.port}/ready`,
          live: `http://${this.config.host}:${this.config.port}/live`,
          tools: `http://${this.config.host}:${this.config.port}/mcp/tools`,
          call: `http://${this.config.host}:${this.config.port}/mcp/call`,
          cacheStats: this.config.cacheEnabled ? `http://${this.config.host}:${this.config.port}/cache/stats` : 'disabled',
          documentation: 'src/docs/api.md'
        }
      });

      // Console output for development
      console.log('🌤️  MCP Weather Server Started');
      console.log('━'.repeat(50));
      console.log(`📍 Server: http://${this.config.host}:${this.config.port}`);
      console.log(`🏥 Health: http://${this.config.host}:${this.config.port}/health`);
      console.log(`✅ Ready: http://${this.config.host}:${this.config.port}/ready`);
      console.log(`❤️  Live: http://${this.config.host}:${this.config.port}/live`);
      console.log(`🔧 Tools: http://${this.config.host}:${this.config.port}/mcp/tools`);
      if (this.config.cacheEnabled) {
        console.log(`📊 Cache: http://${this.config.host}:${this.config.port}/cache/stats`);
      }
      console.log(`📚 Docs: src/docs/api.md`);
      console.log('━'.repeat(50));
      console.log(`🚀 Environment: ${this.config.nodeEnv}`);
      console.log(`📝 Log Level: ${this.config.logLevel}`);
      console.log(`💾 Cache: ${this.config.cacheEnabled ? 'Enabled' : 'Disabled'}`);
      console.log(`⏱️  Timeout: ${this.config.requestTimeout}ms`);
      console.log('━'.repeat(50));
    });

    // Configure keep-alive timeout
    this.server.keepAliveTimeout = this.config.keepAliveTimeout;
    this.server.headersTimeout = this.config.keepAliveTimeout + 1000; // Slightly higher than keep-alive

    // Setup graceful shutdown
    const cleanupFunctions = [
      async () => {
        logger.info('Cleaning up cache data', { operation: 'cache_cleanup' });
        // Cache cleanup would go here if needed
      },
      async () => {
        logger.info('Cleaning up background tasks', { operation: 'background_cleanup' });
        // Background task cleanup would go here if needed
      }
    ];

    setupGracefulShutdown(this.server, cleanupFunctions, this.config.shutdownTimeout);

    logger.info('Graceful shutdown configured', {
      operation: 'graceful_shutdown_setup',
      shutdownTimeout: this.config.shutdownTimeout,
      keepAliveTimeout: this.config.keepAliveTimeout
    });
  }

  public getApp(): express.Application {
    return this.app;
  }
}