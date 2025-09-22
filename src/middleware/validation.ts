import { z } from 'zod';
import { ErrorHandler } from '../utils/errorHandler.js';

// Base schemas for common validations
const CoordinateSchema = z.object({
  latitude: z.number()
    .min(-90, 'Latitude must be between -90 and 90 degrees')
    .max(90, 'Latitude must be between -90 and 90 degrees'),
  longitude: z.number()
    .min(-180, 'Longitude must be between -180 and 180 degrees')
    .max(180, 'Longitude must be between -180 and 180 degrees')
});

const TimezoneSchema = z.string()
  .optional()
  .refine((tz) => !tz || tz === 'auto' || isValidTimezone(tz), {
    message: 'Invalid timezone. Use "auto" or a valid IANA timezone (e.g., "Europe/Paris")'
  });

const TemperatureUnitSchema = z.enum(['celsius', 'fahrenheit'], {
  errorMap: () => ({ message: 'Temperature unit must be either "celsius" or "fahrenheit"' })
}).optional();

// Tool-specific schemas
export const CurrentWeatherSchema = CoordinateSchema.extend({
  timezone: TimezoneSchema,
  temperature_unit: TemperatureUnitSchema,
  wind_speed_unit: z.enum(['kmh', 'ms', 'mph', 'kn']).optional(),
  precipitation_unit: z.enum(['mm', 'inch']).optional()
});

export const ForecastSchema = CoordinateSchema.extend({
  days: z.number()
    .int('Number of days must be a whole number')
    .min(1, 'Number of forecast days must be between 1 and 7')
    .max(7, 'Number of forecast days must be between 1 and 7')
    .optional()
    .default(7),
  timezone: TimezoneSchema,
  temperature_unit: TemperatureUnitSchema
});

export const HourlyForecastSchema = CoordinateSchema.extend({
  forecast_days: z.number()
    .int('Number of forecast days must be a whole number')
    .min(1, 'Number of forecast days must be between 1 and 16')
    .max(16, 'Number of forecast days must be between 1 and 16')
    .optional()
    .default(3),
  timezone: TimezoneSchema,
  temperature_unit: TemperatureUnitSchema
});

export const GeocodingSchema = z.object({
  location: z.string()
    .min(2, 'Location name must be at least 2 characters long')
    .max(100, 'Location name must be less than 100 characters')
    .trim(),
  country: z.string().optional(),
  language: z.string()
    .length(2, 'Language must be a 2-letter ISO code (e.g., "en", "fr", "de")')
    .optional()
    .default('en'),
  max_results: z.number()
    .int('Maximum results must be a whole number')
    .min(1, 'Maximum results must be between 1 and 20')
    .max(20, 'Maximum results must be between 1 and 20')
    .optional()
    .default(5)
});

// Validation functions
export class ParameterValidator {
  private errorHandler: ErrorHandler;

  constructor() {
    this.errorHandler = ErrorHandler.getInstance();
  }

  public validateCurrentWeather(params: any, tool: string = 'get_current_weather'): any {
    return this.validateWithSchema(CurrentWeatherSchema, params, tool, 'current weather validation');
  }

  public validateForecast(params: any, tool: string = 'get_weather_forecast'): any {
    return this.validateWithSchema(ForecastSchema, params, tool, 'forecast validation');
  }

  public validateHourlyForecast(params: any, tool: string = 'get_hourly_forecast'): any {
    return this.validateWithSchema(HourlyForecastSchema, params, tool, 'hourly forecast validation');
  }

  public validateGeocoding(params: any, tool: string = 'geocode_location'): any {
    return this.validateWithSchema(GeocodingSchema, params, tool, 'geocoding validation');
  }

  private validateWithSchema<T>(schema: z.ZodSchema<T>, params: any, tool: string, operation: string): T {
    try {
      // Pre-validate and sanitize input
      const sanitizedParams = this.sanitizeInput(params);

      // Validate with Zod schema
      const result = schema.parse(sanitizedParams);

      console.log(`✅ ${operation} passed for tool: ${tool}`);
      return result;

    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstError = error.errors[0];
        if (firstError) {
          const fieldPath = firstError.path.join('.');
          const message = `${fieldPath}: ${firstError.message}`;

          throw this.errorHandler.createValidationError(message, {
            tool,
            operation,
            parameters: this.sanitizeInput(params),
            originalError: error
          });
        }
      }

      throw this.errorHandler.handleError(error, {
        tool,
        operation,
        parameters: this.sanitizeInput(params)
      });
    }
  }

  public sanitizeInput(input: any): any {
    if (input === null || input === undefined) {
      return {};
    }

    if (typeof input !== 'object') {
      return input;
    }

    const sanitized: any = {};

    for (const [key, value] of Object.entries(input)) {
      // Convert string numbers to actual numbers for coordinates
      if ((key === 'latitude' || key === 'longitude' || key === 'days' || key === 'forecast_days') &&
          typeof value === 'string') {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          sanitized[key] = numValue;
          continue;
        }
      }

      // Trim strings and handle empty strings
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed === '') {
          continue; // Skip empty strings
        }
        sanitized[key] = trimmed;
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  public validateMCPCall(callData: any): { name: string; arguments: any } {
    try {
      // Basic structure validation
      if (!callData || typeof callData !== 'object') {
        throw new Error('Request body must be a valid JSON object');
      }

      if (!callData.name || typeof callData.name !== 'string') {
        throw new Error('Tool name is required and must be a string');
      }

      if (!callData.arguments || typeof callData.arguments !== 'object') {
        throw new Error('Tool arguments are required and must be an object');
      }

      const toolName = callData.name.trim();
      const validTools = ['get_current_weather', 'get_weather_forecast', 'get_hourly_forecast', 'geocode_location'];

      if (!validTools.includes(toolName)) {
        throw new Error(`Unknown tool: ${toolName}. Available tools: ${validTools.join(', ')}`);
      }

      return {
        name: toolName,
        arguments: this.sanitizeInput(callData.arguments)
      };

    } catch (error) {
      throw this.errorHandler.handleError(error, {
        operation: 'MCP call validation',
        parameters: callData
      });
    }
  }

  public validateLocationData(latitude: number, longitude: number): void {
    // Additional location-specific validations
    if (latitude === 0 && longitude === 0) {
      console.warn('⚠️  Coordinates (0,0) detected - this is likely an error or test location');
    }

    // Check for common invalid coordinates
    const invalidCoordinates = [
      { lat: 999, lng: 999, name: 'test values' },
      { lat: -999, lng: -999, name: 'test values' },
      { lat: 180, lng: 360, name: 'degree confusion' }
    ];

    for (const invalid of invalidCoordinates) {
      if (Math.abs(latitude - invalid.lat) < 0.001 && Math.abs(longitude - invalid.lng) < 0.001) {
        throw this.errorHandler.createValidationError(
          `Invalid coordinates detected (${invalid.name}): ${latitude}, ${longitude}`,
          { operation: 'location validation' }
        );
      }
    }
  }

  public validateForecastDays(days: number, maxDays: number = 7): number {
    const validDays = Math.min(Math.max(Math.floor(days), 1), maxDays);

    if (validDays !== days) {
      console.warn(`⚠️  Forecast days adjusted from ${days} to ${validDays}`);
    }

    return validDays;
  }
}

// Helper functions
function isValidTimezone(timezone: string): boolean {
  if (timezone === 'auto') return true;

  try {
    // Test if timezone is valid by trying to create a date with it
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

// Export singleton instance
export const validator = new ParameterValidator();