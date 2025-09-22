import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

async function testMCPServer() {
  console.log('🚀 Testing MCP Weather Server...');
  console.log('='.repeat(60));

  try {
    // Test 1: Health check
    console.log('\n📍 Test 1: Health Check');
    const healthResponse = await axios.get(`${BASE_URL}/health`);
    console.log('✅ Health check:', healthResponse.data);

    // Test 2: List tools
    console.log('\n📍 Test 2: List MCP Tools');
    const toolsResponse = await axios.get(`${BASE_URL}/mcp/tools`);
    console.log('✅ Available tools:', toolsResponse.data.tools.length);
    toolsResponse.data.tools.forEach((tool: any) => {
      console.log(`  • ${tool.name}: ${tool.description}`);
    });

    // Test 3: Get current weather
    console.log('\n📍 Test 3: Get Current Weather (Paris)');
    const currentWeatherResponse = await axios.post(`${BASE_URL}/mcp/call`, {
      name: 'get_current_weather',
      arguments: {
        latitude: 48.8566,
        longitude: 2.3522,
        timezone: 'Europe/Paris',
        temperature_unit: 'celsius'
      }
    });

    const currentData = JSON.parse(currentWeatherResponse.data.content[0].text);
    console.log('✅ Current weather success');
    console.log(`🌡️  Temperature: ${currentData.current_weather.temperature}°C`);
    console.log(`💨 Wind: ${currentData.current_weather.wind_speed} km/h`);

    // Test 4: Get weather forecast (New tool!)
    console.log('\n📍 Test 4: Get Weather Forecast (Tokyo, 5 days)');
    const forecastResponse = await axios.post(`${BASE_URL}/mcp/call`, {
      name: 'get_weather_forecast',
      arguments: {
        latitude: 35.6762,
        longitude: 139.6503,
        days: 5,
        timezone: 'Asia/Tokyo',
        temperature_unit: 'celsius'
      }
    });

    const forecastData = JSON.parse(forecastResponse.data.content[0].text);
    console.log('✅ Weather forecast success');
    console.log(`📅 Forecast days: ${forecastData.forecast_days}`);
    console.log(`📊 Summary:\n${forecastData.summary}`);
    console.log(`🌡️  Tomorrow: ${forecastData.daily_forecast[1].temperature.min}-${forecastData.daily_forecast[1].temperature.max}°C`);
    console.log(`🌧️  Tomorrow precipitation: ${forecastData.daily_forecast[1].precipitation.sum}mm`);

    // Test 5: Error handling - Invalid coordinates
    console.log('\n📍 Test 5: Error Handling - Invalid Coordinates');
    try {
      await axios.post(`${BASE_URL}/mcp/call`, {
        name: 'get_weather_forecast',
        arguments: {
          latitude: 200, // Invalid
          longitude: 2.3522,
          days: 3
        }
      });
      console.log('❌ Should have failed with invalid coordinates');
    } catch (error: any) {
      if (error.response?.status === 400) {
        console.log('✅ Correctly caught invalid coordinates:', error.response.data.error.message);
      } else {
        console.log('❌ Unexpected error:', error.message);
      }
    }

    // Test 6: Get hourly forecast
    console.log('\n📍 Test 6: Get Hourly Forecast (New York, 2 days)');
    const hourlyResponse = await axios.post(`${BASE_URL}/mcp/call`, {
      name: 'get_hourly_forecast',
      arguments: {
        latitude: 40.7128,
        longitude: -74.0060,
        forecast_days: 2,
        timezone: 'America/New_York'
      }
    });

    const hourlyData = JSON.parse(hourlyResponse.data.content[0].text);
    console.log('✅ Hourly forecast success');
    console.log(`📍 Location: ${hourlyData.location.timezone}`);
    console.log(`⏰ Hours available: ${hourlyData.hourly_forecast.time?.length || 0}`);

    console.log('\n='.repeat(60));
    console.log('🎉 All MCP server tests completed successfully!');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    if (error.response?.data) {
      console.error('Response data:', error.response.data);
    }
  }
}

console.log('Starting MCP Weather Server test...');
console.log('Make sure the server is running with: npm run dev');
console.log('');

setTimeout(() => {
  testMCPServer()
    .then(() => {
      console.log('\n✅ Server testing completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Server test failed:', error);
      process.exit(1);
    });
}, 2000);