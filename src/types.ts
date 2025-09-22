export interface WeatherParams {
  latitude: number;
  longitude: number;
  timezone?: string;
  temperature_unit?: 'celsius' | 'fahrenheit';
  wind_speed_unit?: 'kmh' | 'ms' | 'mph' | 'kn';
  precipitation_unit?: 'mm' | 'inch';
  forecast_days?: number;
}

export interface CurrentWeatherData {
  temperature: number;
  windspeed: number;
  winddirection: number;
  weathercode: number;
  is_day: number;
  time: string;
}

export interface HourlyWeatherData {
  time: string[];
  temperature_2m: number[];
  relative_humidity_2m: number[];
  apparent_temperature: number[];
  precipitation_probability: number[];
  precipitation: number[];
  rain: number[];
  showers: number[];
  snowfall: number[];
  snow_depth: number[];
  weather_code: number[];
  pressure_msl: number[];
  surface_pressure: number[];
  cloud_cover: number[];
  visibility: number[];
  evapotranspiration: number[];
  et0_fao_evapotranspiration: number[];
  vapour_pressure_deficit: number[];
  wind_speed_10m: number[];
  wind_speed_80m: number[];
  wind_speed_120m: number[];
  wind_speed_180m: number[];
  wind_direction_10m: number[];
  wind_direction_80m: number[];
  wind_direction_120m: number[];
  wind_direction_180m: number[];
  wind_gusts_10m: number[];
  temperature_80m: number[];
  temperature_120m: number[];
  temperature_180m: number[];
  soil_temperature_0cm: number[];
  soil_temperature_6cm: number[];
  soil_temperature_18cm: number[];
  soil_temperature_54cm: number[];
  soil_moisture_0_1cm: number[];
  soil_moisture_1_3cm: number[];
  soil_moisture_3_9cm: number[];
  soil_moisture_9_27cm: number[];
  soil_moisture_27_81cm: number[];
}

export interface DailyWeatherData {
  time: string[];
  weather_code: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  apparent_temperature_max: number[];
  apparent_temperature_min: number[];
  sunrise: string[];
  sunset: string[];
  daylight_duration: number[];
  sunshine_duration: number[];
  uv_index_max: number[];
  uv_index_clear_sky_max: number[];
  precipitation_sum: number[];
  rain_sum: number[];
  showers_sum: number[];
  snowfall_sum: number[];
  precipitation_hours: number[];
  precipitation_probability_max: number[];
  precipitation_probability_min: number[];
  precipitation_probability_mean: number[];
  wind_speed_10m_max: number[];
  wind_gusts_10m_max: number[];
  wind_direction_10m_dominant: number[];
  shortwave_radiation_sum: number[];
  et0_fao_evapotranspiration: number[];
}

export interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  current_weather?: CurrentWeatherData;
  hourly_units?: Record<string, string>;
  hourly?: Partial<HourlyWeatherData>;
  daily_units?: Record<string, string>;
  daily?: Partial<DailyWeatherData>;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPToolsResponse {
  tools: MCPTool[];
}

export interface MCPCallRequest {
  name: string;
  arguments: Record<string, any>;
}

export interface MCPCallResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

export interface WeatherCodeDescription {
  code: number;
  description: string;
  icon: string;
}