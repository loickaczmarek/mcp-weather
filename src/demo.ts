import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

interface DemoScenario {
  name: string;
  description: string;
  steps: DemoStep[];
}

interface DemoStep {
  action: string;
  request?: any;
  expectedResult?: string;
  processing?: (response: any) => string;
}

class WeatherServerDemo {
  private scenarios: DemoScenario[] = [];

  constructor() {
    this.initializeScenarios();
  }

  private initializeScenarios(): void {
    this.scenarios = [
      {
        name: 'Travel Planning Scenario',
        description: 'Plan a trip from Paris to London with weather considerations',
        steps: [
          {
            action: 'Find coordinates for Paris',
            request: {
              name: 'geocode_location',
              arguments: { location: 'Paris', country: 'France', max_results: 1 }
            },
            processing: (response) => {
              const data = JSON.parse(response.data.content[0].text);
              const result = data.results[0];
              return `📍 Paris coordinates: ${result.latitude}, ${result.longitude}`;
            }
          },
          {
            action: 'Get current weather in Paris',
            request: {
              name: 'get_current_weather',
              arguments: { latitude: 48.8566, longitude: 2.3522, timezone: 'Europe/Paris' }
            },
            processing: (response) => {
              const data = JSON.parse(response.data.content[0].text);
              const weather = data.current_weather;
              const condition = this.getWeatherDescription(weather.weather_code);
              return `🌤️ Paris now: ${weather.temperature}°C, ${condition}, Wind: ${weather.wind_speed} km/h`;
            }
          },
          {
            action: 'Get 5-day forecast for Paris',
            request: {
              name: 'get_weather_forecast',
              arguments: { latitude: 48.8566, longitude: 2.3522, days: 5, timezone: 'Europe/Paris' }
            },
            processing: (response) => {
              const data = JSON.parse(response.data.content[0].text);
              const daily = data.forecast.daily;
              const today = daily.time[0];
              const maxTemp = daily.temperature_2m_max[0];
              const minTemp = daily.temperature_2m_min[0];
              const precipitation = daily.precipitation_sum[0];
              return `📅 Paris forecast (${today}): ${minTemp}°C - ${maxTemp}°C, Rain: ${precipitation}mm`;
            }
          },
          {
            action: 'Find coordinates for London',
            request: {
              name: 'geocode_location',
              arguments: { location: 'London', country: 'United Kingdom', max_results: 1 }
            },
            processing: (response) => {
              const data = JSON.parse(response.data.content[0].text);
              const result = data.results[0];
              return `📍 London coordinates: ${result.latitude}, ${result.longitude}`;
            }
          },
          {
            action: 'Compare weather in London',
            request: {
              name: 'get_current_weather',
              arguments: { latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London' }
            },
            processing: (response) => {
              const data = JSON.parse(response.data.content[0].text);
              const weather = data.current_weather;
              const condition = this.getWeatherDescription(weather.weather_code);
              return `🌤️ London now: ${weather.temperature}°C, ${condition}, Wind: ${weather.wind_speed} km/h`;
            }
          }
        ]
      },
      {
        name: 'Event Planning Scenario',
        description: 'Plan an outdoor event with hourly weather precision',
        steps: [
          {
            action: 'Get event location coordinates (Central Park, NYC)',
            request: {
              name: 'geocode_location',
              arguments: { location: 'Central Park New York', max_results: 1 }
            },
            processing: (response) => {
              const data = JSON.parse(response.data.content[0].text);
              const result = data.results[0];
              return `📍 Event location: ${result.name} (${result.latitude}, ${result.longitude})`;
            }
          },
          {
            action: 'Check current conditions',
            request: {
              name: 'get_current_weather',
              arguments: { latitude: 40.7829, longitude: -73.9654, timezone: 'America/New_York', temperature_unit: 'fahrenheit' }
            },
            processing: (response) => {
              const data = JSON.parse(response.data.content[0].text);
              const weather = data.current_weather;
              const condition = this.getWeatherDescription(weather.weather_code);
              const suitability = weather.weather_code <= 3 && weather.wind_speed < 25 ? '✅ Good for outdoor event' : '⚠️ Consider indoor alternatives';
              return `🌡️ Current: ${weather.temperature}°F, ${condition}, Wind: ${Math.round(weather.wind_speed * 0.621371)} mph - ${suitability}`;
            }
          },
          {
            action: 'Get hourly forecast for event day',
            request: {
              name: 'get_hourly_forecast',
              arguments: { latitude: 40.7829, longitude: -73.9654, forecast_days: 1, timezone: 'America/New_York', temperature_unit: 'fahrenheit' }
            },
            processing: (response) => {
              const data = JSON.parse(response.data.content[0].text);
              const hourly = data.hourly_forecast;

              // Find best time window (e.g., 2 PM to 6 PM)
              const eventHours = [14, 15, 16, 17, 18]; // 2 PM to 6 PM
              let bestConditions = 'Event Hours Analysis:\n';

              for (const hour of eventHours) {
                if (hour < hourly.time.length) {
                  const temp = hourly.temperature_2m[hour];
                  const precipitation = hourly.precipitation[hour] || 0;
                  const time = new Date(hourly.time[hour]).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    hour12: true
                  });
                  const rain = precipitation > 0.1 ? '🌧️' : '☀️';
                  bestConditions += `   ${time}: ${Math.round(temp)}°F ${rain}\n`;
                }
              }

              return bestConditions.trim();
            }
          }
        ]
      },
      {
        name: 'Agricultural Planning Scenario',
        description: 'Farmer planning irrigation and harvest based on weather',
        steps: [
          {
            action: 'Get farm location (Normandy, France)',
            request: {
              name: 'geocode_location',
              arguments: { location: 'Normandy', country: 'France', max_results: 1 }
            },
            processing: (response) => {
              const data = JSON.parse(response.data.content[0].text);
              const result = data.results[0];
              return `🚜 Farm location: ${result.name} (${result.latitude}, ${result.longitude})`;
            }
          },
          {
            action: 'Check 7-day forecast for harvest planning',
            request: {
              name: 'get_weather_forecast',
              arguments: { latitude: 49.1829, longitude: 0.3707, days: 7, timezone: 'Europe/Paris' }
            },
            processing: (response) => {
              const data = JSON.parse(response.data.content[0].text);
              const daily = data.forecast.daily;

              let harvestAdvice = 'Harvest Planning (7-day outlook):\n';
              let dryDays = 0;
              let rainDays = 0;

              for (let i = 0; i < 7; i++) {
                const date = daily.time[i];
                const rain = daily.precipitation_sum[i];
                const maxTemp = daily.temperature_2m_max[i];
                const windSpeed = daily.wind_speed_10m_max[i];

                const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'short' });

                if (rain < 1) {
                  dryDays++;
                  if (windSpeed < 15 && maxTemp < 30) {
                    harvestAdvice += `   ${dayName} (${date}): ✅ Good harvest conditions (${Math.round(maxTemp)}°C, ${rain}mm rain)\n`;
                  } else {
                    harvestAdvice += `   ${dayName} (${date}): ⚠️ Dry but windy/hot (${Math.round(maxTemp)}°C, wind ${Math.round(windSpeed)}km/h)\n`;
                  }
                } else {
                  rainDays++;
                  harvestAdvice += `   ${dayName} (${date}): 🌧️ Rainy day (${rain}mm) - avoid harvest\n`;
                }
              }

              harvestAdvice += `\nSummary: ${dryDays} dry days, ${rainDays} rainy days`;
              return harvestAdvice.trim();
            }
          },
          {
            action: 'Check hourly irrigation needs for tomorrow',
            request: {
              name: 'get_hourly_forecast',
              arguments: { latitude: 49.1829, longitude: 0.3707, forecast_days: 2, timezone: 'Europe/Paris' }
            },
            processing: (response) => {
              const data = JSON.parse(response.data.content[0].text);
              const hourly = data.hourly_forecast;

              // Check next 24 hours for irrigation planning
              let irrigationPlan = 'Irrigation Plan (Next 24h):\n';
              let needsIrrigation = false;
              let rainExpected = 0;

              for (let i = 24; i < 48 && i < hourly.time.length; i++) { // Tomorrow's hours
                const precipitation = hourly.precipitation[i] || 0;
                const humidity = hourly.relative_humidity_2m[i] || 0;
                const temp = hourly.temperature_2m[i];

                rainExpected += precipitation;

                if (precipitation < 0.1 && humidity < 60 && temp > 25) {
                  needsIrrigation = true;
                }
              }

              if (rainExpected > 5) {
                irrigationPlan += '   ✅ Natural irrigation expected - skip watering\n';
              } else if (needsIrrigation) {
                irrigationPlan += '   💧 Irrigation recommended - dry conditions expected\n';
              } else {
                irrigationPlan += '   ⏸️ Monitor conditions - borderline irrigation needs\n';
              }

              irrigationPlan += `   Expected rainfall: ${rainExpected.toFixed(1)}mm`;
              return irrigationPlan.trim();
            }
          }
        ]
      },
      {
        name: 'International Business Scenario',
        description: 'Multi-city weather check for international meetings',
        steps: [
          {
            action: 'Morning meeting in Tokyo',
            request: {
              name: 'get_current_weather',
              arguments: { latitude: 35.6762, longitude: 139.6503, timezone: 'Asia/Tokyo' }
            },
            processing: (response) => {
              const data = JSON.parse(response.data.content[0].text);
              const weather = data.current_weather;
              const localTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' });
              return `🏙️ Tokyo (${localTime}): ${weather.temperature}°C, ${this.getWeatherDescription(weather.weather_code)}`;
            }
          },
          {
            action: 'Afternoon meeting in London',
            request: {
              name: 'get_current_weather',
              arguments: { latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London' }
            },
            processing: (response) => {
              const data = JSON.parse(response.data.content[0].text);
              const weather = data.current_weather;
              const localTime = new Date().toLocaleString('en-US', { timeZone: 'Europe/London' });
              return `🏙️ London (${localTime}): ${weather.temperature}°C, ${this.getWeatherDescription(weather.weather_code)}`;
            }
          },
          {
            action: 'Evening meeting in New York',
            request: {
              name: 'get_current_weather',
              arguments: { latitude: 40.7128, longitude: -74.0060, timezone: 'America/New_York', temperature_unit: 'fahrenheit' }
            },
            processing: (response) => {
              const data = JSON.parse(response.data.content[0].text);
              const weather = data.current_weather;
              const localTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
              return `🏙️ New York (${localTime}): ${weather.temperature}°F, ${this.getWeatherDescription(weather.weather_code)}`;
            }
          }
        ]
      },
      {
        name: 'Emergency Response Scenario',
        description: 'Weather monitoring for emergency planning',
        steps: [
          {
            action: 'Find coordinates for affected area',
            request: {
              name: 'geocode_location',
              arguments: { location: 'Miami Florida', max_results: 1 }
            },
            processing: (response) => {
              const data = JSON.parse(response.data.content[0].text);
              const result = data.results[0];
              return `📍 Emergency response area: ${result.name} (${result.latitude}, ${result.longitude})`;
            }
          },
          {
            action: 'Check current severe weather conditions',
            request: {
              name: 'get_current_weather',
              arguments: { latitude: 25.7617, longitude: -80.1918, timezone: 'America/New_York', temperature_unit: 'fahrenheit' }
            },
            processing: (response) => {
              const data = JSON.parse(response.data.content[0].text);
              const weather = data.current_weather;
              const windMph = Math.round(weather.wind_speed * 0.621371);

              let alertLevel = '🟢 Normal';
              if (weather.weather_code >= 95) alertLevel = '🔴 Severe Weather';
              else if (weather.weather_code >= 80) alertLevel = '🟡 Heavy Rain';
              else if (windMph > 40) alertLevel = '🟠 High Winds';

              return `⚠️ Current conditions: ${weather.temperature}°F, Wind: ${windMph} mph, ${this.getWeatherDescription(weather.weather_code)} - ${alertLevel}`;
            }
          },
          {
            action: 'Get 48-hour emergency forecast',
            request: {
              name: 'get_hourly_forecast',
              arguments: { latitude: 25.7617, longitude: -80.1918, forecast_days: 2, timezone: 'America/New_York', temperature_unit: 'fahrenheit' }
            },
            processing: (response) => {
              const data = JSON.parse(response.data.content[0].text);
              const hourly = data.hourly_forecast;

              let emergencyForecast = 'Emergency 48h Forecast:\n';
              let severeHours = 0;

              for (let i = 0; i < Math.min(48, hourly.time.length); i += 6) { // Every 6 hours
                const time = new Date(hourly.time[i]);
                const timeStr = time.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' });
                const temp = Math.round(hourly.temperature_2m[i]);
                const precipitation = hourly.precipitation[i] || 0;
                const windSpeed = Math.round((hourly.wind_speed_10m[i] || 0) * 0.621371);

                let status = '🟢';
                if (precipitation > 10 || windSpeed > 40) {
                  status = '🔴';
                  severeHours++;
                } else if (precipitation > 5 || windSpeed > 25) {
                  status = '🟡';
                }

                emergencyForecast += `   ${timeStr}: ${temp}°F, ${precipitation.toFixed(1)}mm rain, ${windSpeed}mph wind ${status}\n`;
              }

              emergencyForecast += `\nSevere weather periods detected: ${Math.floor(severeHours/4)} (6-hour blocks)`;
              return emergencyForecast.trim();
            }
          }
        ]
      }
    ];
  }

  async runDemo(): Promise<void> {
    console.log('🌤️ MCP Weather Server - Interactive Demo');
    console.log('==========================================');
    console.log('Showcasing real-world usage scenarios\n');

    // Check server availability
    try {
      await axios.get(`${BASE_URL}/health`);
      console.log('✅ Server is running and healthy\n');
    } catch (error) {
      console.error('❌ Cannot connect to server. Make sure it\'s running with: npm run dev');
      process.exit(1);
    }

    // Show cache statistics before demo
    await this.showCacheStats('Initial');

    // Run each scenario
    for (let i = 0; i < this.scenarios.length; i++) {
      const scenario = this.scenarios[i];
      if (!scenario) continue;

      console.log(`\n${'='.repeat(80)}`);
      console.log(`📋 Scenario ${i + 1}: ${scenario.name}`);
      console.log(`📝 ${scenario.description}`);
      console.log(`${'='.repeat(80)}`);

      for (let j = 0; j < scenario.steps.length; j++) {
        const step = scenario.steps[j];
        if (!step) continue;

        console.log(`\n🔸 Step ${j + 1}: ${step.action}`);

        if (step.request) {
          try {
            const start = Date.now();
            const response = await axios.post(`${BASE_URL}/mcp/call`, step.request);
            const duration = Date.now() - start;

            const cacheStatus = response.headers['x-cache'] || 'UNKNOWN';
            const cacheEmoji = cacheStatus === 'HIT' ? '⚡' : '🌐';

            console.log(`   ${cacheEmoji} Response time: ${duration}ms (Cache: ${cacheStatus})`);

            if (step.processing) {
              const result = step.processing(response);
              console.log(`   ${result}`);
            }

          } catch (error: any) {
            console.log(`   ❌ Error: ${error.message}`);
          }
        }

        // Add delay for better demo experience
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Show scenario completion
      console.log(`\n✅ Scenario "${scenario.name}" completed`);

      // Show cache stats after each scenario
      if (i < this.scenarios.length - 1) {
        await this.showCacheStats(`After Scenario ${i + 1}`);
      }
    }

    // Final cache statistics
    await this.showCacheStats('Final');

    // Performance summary
    await this.showPerformanceSummary();

    console.log(`\n${'='.repeat(80)}`);
    console.log('🎉 Demo completed successfully!');
    console.log('💡 The MCP Weather Server is ready for production use.');
    console.log(`${'='.repeat(80)}`);
  }

  private async showCacheStats(label: string): Promise<void> {
    try {
      const response = await axios.get(`${BASE_URL}/cache/stats`);
      const stats = response.data;

      console.log(`\n📊 Cache Statistics (${label}):`);
      console.log(`   Entries: ${stats.entries} | Hit Rate: ${(stats.hitRate * 100).toFixed(1)}% | Memory: ${(stats.memoryUsage / 1024).toFixed(1)}KB`);

      if (stats.typeBreakdown) {
        const breakdown = Object.entries(stats.typeBreakdown)
          .map(([type, count]) => `${type}: ${count}`)
          .join(', ');
        console.log(`   Breakdown: ${breakdown}`);
      }
    } catch (error) {
      console.log(`   ⚠️ Could not retrieve cache stats`);
    }
  }

  private async showPerformanceSummary(): Promise<void> {
    console.log(`\n⚡ Performance Summary:`);

    // Test a few quick requests to show performance
    const testCalls = [
      { name: 'get_current_weather', args: { latitude: 48.8566, longitude: 2.3522 } },
      { name: 'geocode_location', args: { location: 'Paris', max_results: 1 } }
    ];

    const times = [];
    for (const call of testCalls) {
      const start = Date.now();
      try {
        await axios.post(`${BASE_URL}/mcp/call`, call);
        const duration = Date.now() - start;
        times.push(duration);
      } catch (error) {
        // Ignore errors for performance summary
      }
    }

    if (times.length > 0) {
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      console.log(`   Average response time: ${avgTime.toFixed(1)}ms`);
      console.log(`   Cache optimization: ${avgTime < 50 ? '✅ Excellent' : avgTime < 200 ? '👍 Good' : '⚠️ Could be improved'}`);
    }
  }

  private getWeatherDescription(code: number): string {
    const descriptions: { [key: number]: string } = {
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

    return descriptions[code] || `Weather code ${code}`;
  }
}

async function main() {
  const demo = new WeatherServerDemo();

  try {
    await demo.runDemo();
    process.exit(0);
  } catch (error) {
    console.error('💥 Demo failed:', error);
    process.exit(1);
  }
}

console.log('🔧 Make sure the server is running with: npm run dev');
console.log('🎬 Starting interactive demo in 3 seconds...\n');

setTimeout(main, 3000);