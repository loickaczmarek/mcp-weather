import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { OpenMeteoResponse } from '../types.js';

export interface OpenMeteoCurrentParams {
  latitude: number;
  longitude: number;
  timezone?: string;
  temperature_unit?: 'celsius' | 'fahrenheit';
  wind_speed_unit?: 'kmh' | 'ms' | 'mph' | 'kn';
  precipitation_unit?: 'mm' | 'inch';
}

export interface OpenMeteoForecastParams extends OpenMeteoCurrentParams {
  hourly?: string[];
  daily?: string[];
  forecast_days?: number;
  past_days?: number;
}

export interface OpenMeteoError {
  error: boolean;
  reason: string;
}

export class OpenMeteoService {
  private client: AxiosInstance;
  private baseUrl = 'https://api.open-meteo.com/v1';

  constructor() {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'User-Agent': 'MCP-Weather-Server/1.0.0',
        'Accept': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      (config) => {
        console.log(`🌐 OpenMeteo API Request: ${config.method?.toUpperCase()} ${config.url}`);
        console.log(`📍 Params:`, config.params);
        return config;
      },
      (error) => {
        console.error('❌ OpenMeteo Request Error:', error);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response: AxiosResponse<OpenMeteoResponse>) => {
        console.log(`✅ OpenMeteo API Response: ${response.status} - ${response.config.url}`);
        console.log(`⚡ Generation time: ${response.data.generationtime_ms}ms`);
        return response;
      },
      (error: AxiosError<OpenMeteoError>) => {
        console.error('❌ OpenMeteo Response Error:', {
          status: error.response?.status,
          message: error.response?.data?.reason || error.message,
          url: error.config?.url
        });
        return Promise.reject(this.handleError(error));
      }
    );
  }

  private handleError(error: AxiosError<OpenMeteoError>): Error {
    if (error.response?.data?.error) {
      return new Error(`OpenMeteo API Error: ${error.response.data.reason}`);
    }

    if (error.code === 'ECONNABORTED') {
      return new Error('OpenMeteo API request timeout');
    }

    if (error.response?.status === 400) {
      return new Error('Invalid parameters provided to OpenMeteo API');
    }

    if (error.response?.status === 429) {
      return new Error('OpenMeteo API rate limit exceeded');
    }

    if (error.response?.status && error.response.status >= 500) {
      return new Error('OpenMeteo API server error');
    }

    return new Error(`OpenMeteo API request failed: ${error.message}`);
  }

  private buildQueryParams(params: OpenMeteoForecastParams): URLSearchParams {
    const queryParams = new URLSearchParams({
      latitude: params.latitude.toString(),
      longitude: params.longitude.toString(),
    });

    if (params.timezone) {
      queryParams.append('timezone', params.timezone);
    }

    if (params.temperature_unit) {
      queryParams.append('temperature_unit', params.temperature_unit);
    }

    if (params.wind_speed_unit) {
      queryParams.append('wind_speed_unit', params.wind_speed_unit);
    }

    if (params.precipitation_unit) {
      queryParams.append('precipitation_unit', params.precipitation_unit);
    }

    if (params.forecast_days) {
      queryParams.append('forecast_days', params.forecast_days.toString());
    }

    if (params.past_days) {
      queryParams.append('past_days', params.past_days.toString());
    }

    if (params.hourly?.length) {
      queryParams.append('hourly', params.hourly.join(','));
    }

    if (params.daily?.length) {
      queryParams.append('daily', params.daily.join(','));
    }

    return queryParams;
  }

  async getCurrentWeather(params: OpenMeteoCurrentParams): Promise<OpenMeteoResponse> {
    console.log(`🌤️  Fetching current weather for coordinates: ${params.latitude}, ${params.longitude}`);

    const forecastParams: OpenMeteoForecastParams = {
      ...params,
    };

    const queryParams = this.buildQueryParams(forecastParams);
    queryParams.append('current_weather', 'true');

    try {
      const response = await this.client.get<OpenMeteoResponse>('/forecast', {
        params: queryParams,
      });

      if (!response.data.current_weather) {
        throw new Error('No current weather data returned from OpenMeteo API');
      }

      console.log(`🌡️  Current temperature: ${response.data.current_weather.temperature}°C`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch current weather:', error);
      throw error;
    }
  }

  async getForecast(params: OpenMeteoForecastParams): Promise<OpenMeteoResponse> {
    const forecastType = params.hourly?.length ? 'hourly' : 'daily';
    const days = params.forecast_days || 7;

    console.log(`📅 Fetching ${forecastType} forecast for ${days} days at coordinates: ${params.latitude}, ${params.longitude}`);

    const queryParams = this.buildQueryParams(params);

    try {
      const response = await this.client.get<OpenMeteoResponse>('/forecast', {
        params: queryParams,
      });

      const hasHourlyData = response.data.hourly && Object.keys(response.data.hourly).length > 0;
      const hasDailyData = response.data.daily && Object.keys(response.data.daily).length > 0;

      if (!hasHourlyData && !hasDailyData) {
        throw new Error('No forecast data returned from OpenMeteo API');
      }

      console.log(`📊 Forecast data received: ${hasHourlyData ? 'hourly' : ''} ${hasDailyData ? 'daily' : ''}`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch forecast:', error);
      throw error;
    }
  }

  async getHourlyForecast(params: OpenMeteoCurrentParams & { forecast_days?: number }): Promise<OpenMeteoResponse> {
    const hourlyParams = [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'precipitation_probability',
      'precipitation',
      'rain',
      'weather_code',
      'pressure_msl',
      'cloud_cover',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m'
    ];

    return this.getForecast({
      ...params,
      hourly: hourlyParams,
      forecast_days: params.forecast_days || 3,
    });
  }

  async getDailyForecast(params: OpenMeteoCurrentParams & { forecast_days?: number }): Promise<OpenMeteoResponse> {
    const dailyParams = [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'apparent_temperature_max',
      'apparent_temperature_min',
      'sunrise',
      'sunset',
      'uv_index_max',
      'precipitation_sum',
      'rain_sum',
      'showers_sum',
      'snowfall_sum',
      'precipitation_hours',
      'precipitation_probability_max',
      'wind_speed_10m_max',
      'wind_gusts_10m_max',
      'wind_direction_10m_dominant'
    ];

    return this.getForecast({
      ...params,
      daily: dailyParams,
      forecast_days: params.forecast_days || 7,
    });
  }

  async testConnection(): Promise<boolean> {
    console.log('🔍 Testing OpenMeteo API connection...');

    try {
      const testParams: OpenMeteoCurrentParams = {
        latitude: 48.8566,
        longitude: 2.3522,
        timezone: 'Europe/Paris'
      };

      const response = await this.getCurrentWeather(testParams);

      if (response.current_weather) {
        console.log('✅ OpenMeteo API connection test successful!');
        console.log(`📍 Test location: Paris (${response.latitude}, ${response.longitude})`);
        console.log(`🌡️  Test temperature: ${response.current_weather.temperature}°C`);
        return true;
      }

      return false;
    } catch (error) {
      console.error('❌ OpenMeteo API connection test failed:', error);
      return false;
    }
  }

  getApiStatus(): { baseUrl: string; timeout: number } {
    return {
      baseUrl: this.baseUrl,
      timeout: this.client.defaults.timeout || 10000,
    };
  }
}