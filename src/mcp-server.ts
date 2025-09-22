/**
 * 🌤️ MCP Weather Server - HTTP Transport
 *
 * Standard MCP HTTP server implementation compatible with Claude Code.
 * Follows JSON-RPC 2.0 protocol for MCP communication.
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { Server } from 'http';
import { OptimizedWeatherService } from './services/optimizedWeatherService.js';
import { ForecastTool } from './tools/forecast.js';
import { GeocodingTool } from './tools/geocoding.js';
import { validator } from './middleware/validation.js';
import { ErrorHandler, WeatherError } from './utils/errorHandler.js';
import { logger } from './utils/logger.js';
import { loadEnvironmentConfig, ServerConfig } from './config/environment.js';

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
  private optimizedWeatherService: OptimizedWeatherService;
  private forecastTool: ForecastTool;
  private geocodingTool: GeocodingTool;
  private errorHandler: ErrorHandler;
  private config: ServerConfig;

  constructor() {
    this.config = loadEnvironmentConfig();
    this.app = express();
    this.optimizedWeatherService = new OptimizedWeatherService();
    this.forecastTool = new ForecastTool();
    this.geocodingTool = new GeocodingTool();
    this.errorHandler = ErrorHandler.getInstance();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();

    logger.info('MCP HTTP Server initialized', {
      operation: 'mcp_server_initialization',
      port: this.config.port
    });
  }

  private setupMiddleware(): void {
    // CORS configuration
    this.app.use(cors({
      origin: this.config.corsOrigin,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: this.config.corsCredentials
    }));

    // Request parsing with JSON error handling
    this.app.use(express.json({
      limit: this.config.maxRequestSize,
      strict: true,
      type: 'application/json',
      // Custom error handling for malformed JSON
      verify: (_req: Request, res: Response, buf: Buffer) => {
        try {
          JSON.parse(buf.toString());
        } catch (error) {
          const errorResponse: MCPResponse = {
            jsonrpc: "2.0",
            id: null,
            error: {
              code: -32700,
              message: "Parse error",
              data: { reason: "Invalid JSON format" }
            }
          };
          res.status(400).json(errorResponse);
          throw new Error('JSON Parse Error'); // Stop further processing
        }
      }
    }));

    // Request timeout
    this.app.use((req: Request, res: Response, next) => {
      req.setTimeout(this.config.requestTimeout, () => {
        const errorResponse: MCPResponse = {
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32603,
            message: "Request timeout",
            data: { timeout: this.config.requestTimeout }
          }
        };
        res.status(408).json(errorResponse);
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint for Claude Code
    this.app.get('/mcp/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        transport: 'http-streamable'
      });
    });

    // Also allow POST for health check
    this.app.post('/mcp/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        transport: 'http-streamable'
      });
    });

    // Main MCP endpoint - HTTP Streamable with SSE
    this.app.post('/mcp', this.handleMCPStreamableRequest.bind(this));

    // Alternative root endpoint for flexibility
    this.app.post('/', this.handleMCPStreamableRequest.bind(this));

    // Legacy JSON-RPC 2.0 endpoint (non-streamable)
    this.app.post('/mcp/legacy', this.handleMCPRequest.bind(this));
  }

  private async handleMCPStreamableRequest(req: Request, res: Response): Promise<void> {
    try {
      // Set headers for HTTP streaming with chunked transfer encoding
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'no-cache');

      const request: MCPRequest = req.body;

      // Validate JSON-RPC 2.0 format
      if (!request || request.jsonrpc !== "2.0" || !request.method) {
        const errorResponse: MCPResponse = {
          jsonrpc: "2.0",
          id: request?.id || null,
          error: {
            code: -32600,
            message: "Invalid Request",
            data: { reason: "Missing or invalid JSON-RPC 2.0 format" }
          }
        };
        res.write(JSON.stringify(errorResponse) + '\n');
        res.end();
        return;
      }

      logger.debug('Processing MCP streamable request', {
        operation: 'mcp_streamable_request',
        method: request.method,
        id: request.id
      });

      let result: any;

      switch (request.method) {
        case 'initialize':
          result = await this.handleInitialize(request.params);
          break;

        case 'tools/list':
          result = await this.handleListTools();
          break;

        case 'tools/call':
          result = await this.handleCallTool(request.params);
          break;

        default:
          const errorResponse: MCPResponse = {
            jsonrpc: "2.0",
            id: request.id ?? null,
            error: {
              code: -32601,
              message: "Method not found",
              data: { method: request.method }
            }
          };
          res.write(JSON.stringify(errorResponse) + '\n');
          res.end();
          return;
      }

      const response: MCPResponse = {
        jsonrpc: "2.0",
        id: request.id ?? null,
        result
      };

      // Stream the response with newline delimiter for JSON-RPC streaming
      res.write(JSON.stringify(response) + '\n');
      res.end();

    } catch (error) {
      this.handleStreamableError(res, error, req.body?.id ?? null);
    }
  }

  private async handleMCPRequest(req: Request, res: Response): Promise<void> {
    try {
      const request: MCPRequest = req.body;

      // Validate JSON-RPC 2.0 format
      if (!request || request.jsonrpc !== "2.0" || !request.method) {
        const errorResponse: MCPResponse = {
          jsonrpc: "2.0",
          id: request?.id || null,
          error: {
            code: -32600,
            message: "Invalid Request",
            data: { reason: "Missing or invalid JSON-RPC 2.0 format" }
          }
        };
        res.status(400).json(errorResponse);
        return;
      }

      logger.debug('Processing MCP request', {
        operation: 'mcp_request',
        method: request.method,
        id: request.id
      });

      let result: any;

      switch (request.method) {
        case 'initialize':
          result = await this.handleInitialize(request.params);
          break;

        case 'tools/list':
          result = await this.handleListTools();
          break;

        case 'tools/call':
          result = await this.handleCallTool(request.params);
          break;

        default:
          const errorResponse: MCPResponse = {
            jsonrpc: "2.0",
            id: request.id ?? null,
            error: {
              code: -32601,
              message: "Method not found",
              data: { method: request.method }
            }
          };
          res.status(404).json(errorResponse);
          return;
      }

      const response: MCPResponse = {
        jsonrpc: "2.0",
        id: request.id ?? null,
        result
      };

      res.json(response);

    } catch (error) {
      this.handleError(res, error, req.body?.id ?? null);
    }
  }

  private async handleInitialize(params?: any): Promise<any> {
    logger.info('MCP session initialized', {
      operation: 'mcp_initialize',
      clientInfo: params
    });

    return {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
        logging: {}
      },
      serverInfo: {
        name: "mcp-weather-server",
        version: "1.0.0"
      }
    };
  }

  private async handleListTools(): Promise<any> {
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
- 6-7 days: General trends, useful for preliminary planning`,
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

🔄 **Performance:** Cached for 30 minutes to balance data freshness with response speed.`,
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

🔄 **Performance:** Cached for 2 hours since location coordinates rarely change.`,
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

    return { tools };
  }

  private async handleCallTool(params: any): Promise<any> {
    if (!params || !params.name) {
      throw new Error('Tool name is required');
    }

    const { name, arguments: args } = params;

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
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{
        type: 'text',
        text: result
      }]
    };
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

  private handleStreamableError(res: Response, error: any, requestId: string | number | null | undefined): void {
    const id = requestId ?? null;
    logger.error('MCP streamable request error', {
      operation: 'mcp_streamable_error',
      requestId,
      error: error.message
    });

    let mcpError: MCPError;

    if (error instanceof WeatherError) {
      mcpError = {
        code: error.statusCode,
        message: error.userMessage,
        data: {
          type: error.type,
          timestamp: error.timestamp.toISOString(),
          correlationId: error.context.correlationId
        }
      };
    } else {
      mcpError = {
        code: -32603,
        message: error.message || 'Internal error',
        data: { timestamp: new Date().toISOString() }
      };
    }

    const errorResponse: MCPResponse = {
      jsonrpc: "2.0",
      id,
      error: mcpError
    };

    // Stream the error response
    try {
      res.write(JSON.stringify(errorResponse) + '\n');
      res.end();
    } catch (writeError) {
      logger.error('Failed to write streamable error response', { error: writeError instanceof Error ? writeError.message : String(writeError) });
    }
  }

  private handleError(res: Response, error: any, requestId: string | number | null | undefined): void {
    const id = requestId ?? null;
    logger.error('MCP request error', {
      operation: 'mcp_error',
      requestId,
      error: error.message
    });

    let mcpError: MCPError;

    if (error instanceof WeatherError) {
      mcpError = {
        code: error.statusCode,
        message: error.userMessage,
        data: {
          type: error.type,
          timestamp: error.timestamp.toISOString(),
          correlationId: error.context.correlationId
        }
      };
    } else {
      mcpError = {
        code: -32603,
        message: error.message || 'Internal error',
        data: { timestamp: new Date().toISOString() }
      };
    }

    const errorResponse: MCPResponse = {
      jsonrpc: "2.0",
      id,
      error: mcpError
    };

    const statusCode = mcpError.code === -32600 ? 400 :
                       mcpError.code === -32601 ? 404 : 500;

    res.status(statusCode).json(errorResponse);
  }

  private setupErrorHandling(): void {
    this.app.use((err: Error, req: Request, res: Response, _next: any) => {
      logger.error('Unhandled error in MCP server', {
        operation: 'unhandled_error',
        path: req.path,
        method: req.method
      }, err);

      const errorResponse: MCPResponse = {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32603,
          message: 'Internal error'
        }
      };

      res.status(500).json(errorResponse);
    });

    this.app.use((req: Request, res: Response) => {
      logger.warn('MCP endpoint not found', {
        operation: 'route_not_found',
        endpoint: req.path,
        method: req.method
      });

      const errorResponse: MCPResponse = {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32601,
          message: 'Method not found',
          data: { path: req.path }
        }
      };

      res.status(404).json(errorResponse);
    });
  }

  public start(): void {
    this.server = this.app.listen(this.config.port, this.config.host, () => {
      logger.info('MCP HTTP Server started', {
        operation: 'mcp_server_startup',
        host: this.config.host,
        port: this.config.port,
        endpoints: {
          mcp: `http://${this.config.host}:${this.config.port}/mcp`,
          health: `http://${this.config.host}:${this.config.port}/mcp/health`
        }
      });

      console.log('🌤️  MCP HTTP Weather Server Started');
      console.log('━'.repeat(50));
      console.log(`📍 MCP Endpoint: http://${this.config.host}:${this.config.port}/mcp`);
      console.log(`🏥 Health Check: http://${this.config.host}:${this.config.port}/mcp/health`);
      console.log('━'.repeat(50));
      console.log('🔗 Claude Code Integration:');
      console.log(`   claude mcp add --transport http weather http://${this.config.host}:${this.config.port}/mcp`);
      console.log('━'.repeat(50));
    });

    this.server.keepAliveTimeout = this.config.keepAliveTimeout;
    this.server.headersTimeout = this.config.keepAliveTimeout + 1000;
  }

  public getApp(): express.Application {
    return this.app;
  }
}