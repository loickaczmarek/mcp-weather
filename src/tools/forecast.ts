import { WeatherService } from '../services/weatherService.js';
import { OpenMeteoResponse } from '../types.js';
import { ErrorHandler } from '../utils/errorHandler.js';

export interface ForecastParams {
  latitude: number;
  longitude: number;
  days?: number;
  timezone?: string;
  temperature_unit?: 'celsius' | 'fahrenheit';
}

export interface ForecastResult {
  location: {
    latitude: number;
    longitude: number;
    timezone: string;
    elevation: number;
  };
  forecast_days: number;
  daily_forecast: DayForecast[];
  summary: string;
}

export interface DayForecast {
  date: string;
  weather_code: number;
  weather_description: string;
  temperature: {
    max: number;
    min: number;
    unit: string;
  };
  precipitation: {
    sum: number;
    probability_max: number;
    hours: number;
    unit: string;
  };
  wind: {
    max_speed: number;
    max_gusts: number;
    dominant_direction: number;
    unit: string;
  };
  sun: {
    sunrise: string;
    sunset: string;
    daylight_duration: number;
  };
  uv_index: number;
}

export class ForecastTool {
  private weatherService: WeatherService;
  private errorHandler: ErrorHandler;

  constructor() {
    this.weatherService = new WeatherService();
    this.errorHandler = ErrorHandler.getInstance();
  }

  async getForecast(params: ForecastParams): Promise<string> {
    try {
      this.validateParams(params);

      const days = Math.min(Math.max(params.days || 7, 1), 7);

      console.log(`📅 Getting ${days}-day forecast for coordinates: ${params.latitude}, ${params.longitude}`);

      const dailyParams = [
        'weather_code',
        'temperature_2m_max',
        'temperature_2m_min',
        'sunrise',
        'sunset',
        'daylight_duration',
        'uv_index_max',
        'precipitation_sum',
        'precipitation_hours',
        'precipitation_probability_max',
        'wind_speed_10m_max',
        'wind_gusts_10m_max',
        'wind_direction_10m_dominant'
      ];

      const response = await this.weatherService.getForecast({
        latitude: params.latitude,
        longitude: params.longitude,
        daily: dailyParams,
        forecast_days: days,
        timezone: params.timezone || 'auto',
        temperature_unit: params.temperature_unit || 'celsius'
      });

      if (!response.daily) {
        throw this.errorHandler.createApiError(
          'No forecast data available from OpenMeteo API',
          { tool: 'get_weather_forecast', operation: 'forecast data retrieval', parameters: params }
        );
      }

      const forecast = this.formatForecast(response, days, params.temperature_unit || 'celsius');
      return JSON.stringify(forecast, null, 2);

    } catch (error) {
      throw this.errorHandler.handleError(error, {
        tool: 'get_weather_forecast',
        operation: 'forecast generation',
        parameters: params
      });
    }
  }

  private validateParams(params: ForecastParams): void {
    if (typeof params.latitude !== 'number' || typeof params.longitude !== 'number') {
      throw this.errorHandler.createValidationError(
        'Latitude and longitude must be numbers',
        { tool: 'get_weather_forecast', operation: 'parameter validation', parameters: params }
      );
    }

    if (params.latitude < -90 || params.latitude > 90) {
      throw this.errorHandler.createValidationError(
        'Latitude must be between -90 and 90 degrees',
        { tool: 'get_weather_forecast', operation: 'coordinate validation', parameters: params }
      );
    }

    if (params.longitude < -180 || params.longitude > 180) {
      throw this.errorHandler.createValidationError(
        'Longitude must be between -180 and 180 degrees',
        { tool: 'get_weather_forecast', operation: 'coordinate validation', parameters: params }
      );
    }

    if (params.days !== undefined && (params.days < 1 || params.days > 7)) {
      throw this.errorHandler.createValidationError(
        'Number of forecast days must be between 1 and 7',
        { tool: 'get_weather_forecast', operation: 'days validation', parameters: params }
      );
    }

    if (params.temperature_unit && !['celsius', 'fahrenheit'].includes(params.temperature_unit)) {
      throw this.errorHandler.createValidationError(
        'Temperature unit must be either "celsius" or "fahrenheit"',
        { tool: 'get_weather_forecast', operation: 'unit validation', parameters: params }
      );
    }
  }

  private formatForecast(response: OpenMeteoResponse, days: number, temperatureUnit: string): ForecastResult {
    const daily = response.daily!;
    const dailyForecasts: DayForecast[] = [];

    for (let i = 0; i < Math.min(days, daily.time?.length || 0); i++) {
      const dayForecast: DayForecast = {
        date: daily.time?.[i] || 'Unknown',
        weather_code: daily.weather_code?.[i] || 0,
        weather_description: this.getWeatherDescription(daily.weather_code?.[i] || 0),
        temperature: {
          max: daily.temperature_2m_max?.[i] || 0,
          min: daily.temperature_2m_min?.[i] || 0,
          unit: temperatureUnit === 'fahrenheit' ? '°F' : '°C'
        },
        precipitation: {
          sum: daily.precipitation_sum?.[i] || 0,
          probability_max: daily.precipitation_probability_max?.[i] || 0,
          hours: daily.precipitation_hours?.[i] || 0,
          unit: 'mm'
        },
        wind: {
          max_speed: daily.wind_speed_10m_max?.[i] || 0,
          max_gusts: daily.wind_gusts_10m_max?.[i] || 0,
          dominant_direction: daily.wind_direction_10m_dominant?.[i] || 0,
          unit: 'km/h'
        },
        sun: {
          sunrise: daily.sunrise?.[i] || 'Unknown',
          sunset: daily.sunset?.[i] || 'Unknown',
          daylight_duration: daily.daylight_duration?.[i] || 0
        },
        uv_index: daily.uv_index_max?.[i] || 0
      };

      dailyForecasts.push(dayForecast);
    }

    const avgTemp = dailyForecasts.reduce((sum, day) => sum + (day.temperature.max + day.temperature.min) / 2, 0) / dailyForecasts.length;
    const totalPrecipitation = dailyForecasts.reduce((sum, day) => sum + day.precipitation.sum, 0);
    const avgWind = dailyForecasts.reduce((sum, day) => sum + day.wind.max_speed, 0) / dailyForecasts.length;

    const summary = this.generateSummary(dailyForecasts, avgTemp, totalPrecipitation, avgWind, temperatureUnit);

    return {
      location: {
        latitude: response.latitude,
        longitude: response.longitude,
        timezone: response.timezone,
        elevation: response.elevation
      },
      forecast_days: days,
      daily_forecast: dailyForecasts,
      summary
    };
  }

  private generateSummary(forecasts: DayForecast[], avgTemp: number, totalPrecip: number, avgWind: number, unit: string): string {
    const tempUnit = unit === 'fahrenheit' ? '°F' : '°C';
    const highestTemp = Math.max(...forecasts.map(f => f.temperature.max));
    const lowestTemp = Math.min(...forecasts.map(f => f.temperature.min));

    const rainyDays = forecasts.filter(f => f.precipitation.sum > 1).length;
    const windyDays = forecasts.filter(f => f.wind.max_speed > 20).length;

    let summary = `${forecasts.length}-day weather forecast:\n`;
    summary += `• Average temperature: ${avgTemp.toFixed(1)}${tempUnit}\n`;
    summary += `• Temperature range: ${lowestTemp}${tempUnit} to ${highestTemp}${tempUnit}\n`;
    summary += `• Total precipitation: ${totalPrecip.toFixed(1)}mm\n`;
    summary += `• Average wind speed: ${avgWind.toFixed(1)} km/h\n`;

    if (rainyDays > 0) {
      summary += `• Rainy days expected: ${rainyDays}\n`;
    }

    if (windyDays > 0) {
      summary += `• Windy days expected: ${windyDays}\n`;
    }

    return summary;
  }

  private getWeatherDescription(code: number): string {
    const weatherCodes: Record<number, string> = {
      0: 'Clear sky',
      1: 'Mainly clear',
      2: 'Partly cloudy',
      3: 'Overcast',
      45: 'Fog',
      48: 'Depositing rime fog',
      51: 'Light drizzle',
      53: 'Moderate drizzle',
      55: 'Dense drizzle',
      56: 'Light freezing drizzle',
      57: 'Dense freezing drizzle',
      61: 'Slight rain',
      63: 'Moderate rain',
      65: 'Heavy rain',
      66: 'Light freezing rain',
      67: 'Heavy freezing rain',
      71: 'Slight snow fall',
      73: 'Moderate snow fall',
      75: 'Heavy snow fall',
      77: 'Snow grains',
      80: 'Slight rain showers',
      81: 'Moderate rain showers',
      82: 'Violent rain showers',
      85: 'Slight snow showers',
      86: 'Heavy snow showers',
      95: 'Thunderstorm',
      96: 'Thunderstorm with slight hail',
      99: 'Thunderstorm with heavy hail'
    };

    return weatherCodes[code] || `Unknown weather (code: ${code})`;
  }

}