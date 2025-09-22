import { OpenMeteoService, OpenMeteoCurrentParams, OpenMeteoForecastParams } from './openMeteoService.js';
import { OpenMeteoResponse } from '../types.js';

export interface WeatherServiceRequest {
  latitude: number;
  longitude: number;
  current?: boolean;
  hourly?: string[];
  daily?: string[];
  timezone?: string;
  forecast_days?: number;
  temperature_unit?: string;
  wind_speed_unit?: string;
  precipitation_unit?: string;
}

export class WeatherService {
  private openMeteoService: OpenMeteoService;

  constructor() {
    this.openMeteoService = new OpenMeteoService();
  }

  async getCurrentWeather(params: WeatherServiceRequest): Promise<OpenMeteoResponse> {
    const openMeteoParams: OpenMeteoCurrentParams = {
      latitude: params.latitude,
      longitude: params.longitude,
      ...(params.timezone && { timezone: params.timezone }),
      ...(params.temperature_unit && { temperature_unit: params.temperature_unit as 'celsius' | 'fahrenheit' }),
      ...(params.wind_speed_unit && { wind_speed_unit: params.wind_speed_unit as any }),
      ...(params.precipitation_unit && { precipitation_unit: params.precipitation_unit as 'mm' | 'inch' })
    };

    return this.openMeteoService.getCurrentWeather(openMeteoParams);
  }

  async getForecast(params: WeatherServiceRequest): Promise<OpenMeteoResponse> {
    const openMeteoParams: OpenMeteoForecastParams = {
      latitude: params.latitude,
      longitude: params.longitude,
      ...(params.timezone && { timezone: params.timezone }),
      ...(params.temperature_unit && { temperature_unit: params.temperature_unit as 'celsius' | 'fahrenheit' }),
      ...(params.wind_speed_unit && { wind_speed_unit: params.wind_speed_unit as any }),
      ...(params.precipitation_unit && { precipitation_unit: params.precipitation_unit as 'mm' | 'inch' }),
      ...(params.forecast_days && { forecast_days: params.forecast_days }),
      ...(params.hourly && { hourly: params.hourly }),
      ...(params.daily && { daily: params.daily })
    };

    return this.openMeteoService.getForecast(openMeteoParams);
  }

  async testConnection(): Promise<boolean> {
    return this.openMeteoService.testConnection();
  }
}