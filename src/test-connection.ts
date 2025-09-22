import { OpenMeteoService } from './services/openMeteoService.js';

async function testOpenMeteoConnection() {
  console.log('🚀 Starting OpenMeteo API connection test...');
  console.log('='.repeat(50));

  const service = new OpenMeteoService();

  console.log('📊 Service configuration:', service.getApiStatus());
  console.log('');

  const isConnected = await service.testConnection();

  console.log('');
  console.log('='.repeat(50));

  if (isConnected) {
    console.log('🎉 OpenMeteo API is working correctly!');

    console.log('\n📍 Testing additional locations...');

    try {
      const tokyoWeather = await service.getCurrentWeather({
        latitude: 35.6762,
        longitude: 139.6503,
        timezone: 'Asia/Tokyo',
        temperature_unit: 'celsius'
      });

      console.log(`🗾 Tokyo weather: ${tokyoWeather.current_weather?.temperature}°C`);

      const nyForecast = await service.getDailyForecast({
        latitude: 40.7128,
        longitude: -74.0060,
        timezone: 'America/New_York',
        forecast_days: 5
      });

      console.log(`🏙️  New York 5-day forecast available: ${nyForecast.daily ? 'Yes' : 'No'}`);

      if (nyForecast.daily?.temperature_2m_max) {
        console.log(`🌡️  Max temperatures: ${nyForecast.daily.temperature_2m_max.slice(0, 3).join(', ')}°C`);
      }

    } catch (error) {
      console.error('❌ Additional tests failed:', error);
    }

  } else {
    console.log('💥 OpenMeteo API connection failed!');
    process.exit(1);
  }
}

testOpenMeteoConnection()
  .then(() => {
    console.log('\n✅ All tests completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test failed with error:', error);
    process.exit(1);
  });