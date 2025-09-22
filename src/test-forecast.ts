import { ForecastTool } from './tools/forecast.js';

async function testForecastTool() {
  console.log('🚀 Testing Forecast Tool...');
  console.log('='.repeat(60));

  const forecastTool = new ForecastTool();

  // Test 1: Paris 7-day forecast
  console.log('\n📍 Test 1: Paris 7-day forecast');
  try {
    const parisResult = await forecastTool.getForecast({
      latitude: 48.8566,
      longitude: 2.3522,
      days: 7,
      timezone: 'Europe/Paris',
      temperature_unit: 'celsius'
    });

    const parsed = JSON.parse(parisResult);
    console.log('✅ Paris forecast success');
    console.log(`📅 Days: ${parsed.forecast_days}`);
    console.log(`🌡️  Temperature range: ${parsed.daily_forecast[0].temperature.min}-${parsed.daily_forecast[0].temperature.max}°C`);
    console.log(`📊 Summary:\n${parsed.summary}`);
  } catch (error) {
    console.error('❌ Paris forecast failed:', error);
  }

  // Test 2: Tokyo 3-day forecast in Fahrenheit
  console.log('\n📍 Test 2: Tokyo 3-day forecast (Fahrenheit)');
  try {
    const tokyoResult = await forecastTool.getForecast({
      latitude: 35.6762,
      longitude: 139.6503,
      days: 3,
      timezone: 'Asia/Tokyo',
      temperature_unit: 'fahrenheit'
    });

    const parsed = JSON.parse(tokyoResult);
    console.log('✅ Tokyo forecast success');
    console.log(`📅 Days: ${parsed.forecast_days}`);
    console.log(`🌡️  First day: ${parsed.daily_forecast[0].temperature.min}-${parsed.daily_forecast[0].temperature.max}°F`);
    console.log(`🌧️  First day precipitation: ${parsed.daily_forecast[0].precipitation.sum}mm`);
  } catch (error) {
    console.error('❌ Tokyo forecast failed:', error);
  }

  // Test 3: Error handling - Invalid coordinates
  console.log('\n📍 Test 3: Error handling - Invalid coordinates');
  try {
    await forecastTool.getForecast({
      latitude: 200, // Invalid latitude
      longitude: 2.3522,
      days: 5
    });
    console.log('❌ Should have failed with invalid coordinates');
  } catch (error) {
    console.log('✅ Correctly caught invalid coordinates:', (error as Error).message);
  }

  // Test 4: Error handling - Invalid days
  console.log('\n📍 Test 4: Error handling - Invalid days');
  try {
    await forecastTool.getForecast({
      latitude: 40.7128,
      longitude: -74.0060,
      days: 10 // Invalid days (> 7)
    });
    console.log('❌ Should have failed with invalid days');
  } catch (error) {
    console.log('✅ Correctly caught invalid days:', (error as Error).message);
  }

  // Test 5: Edge case - 1 day forecast
  console.log('\n📍 Test 5: Edge case - 1 day forecast (New York)');
  try {
    const nyResult = await forecastTool.getForecast({
      latitude: 40.7128,
      longitude: -74.0060,
      days: 1,
      timezone: 'America/New_York'
    });

    const parsed = JSON.parse(nyResult);
    console.log('✅ 1-day forecast success');
    console.log(`📅 Days: ${parsed.forecast_days}`);
    console.log(`🌅 Sunrise: ${parsed.daily_forecast[0].sun.sunrise}`);
    console.log(`🌇 Sunset: ${parsed.daily_forecast[0].sun.sunset}`);
    console.log(`☀️  UV Index: ${parsed.daily_forecast[0].uv_index}`);
  } catch (error) {
    console.error('❌ 1-day forecast failed:', error);
  }

  // Test 6: Extreme coordinates - Antarctica
  console.log('\n📍 Test 6: Extreme coordinates - Antarctica');
  try {
    const antarcticaResult = await forecastTool.getForecast({
      latitude: -89.0,
      longitude: 0.0,
      days: 3,
      timezone: 'UTC'
    });

    const parsed = JSON.parse(antarcticaResult);
    console.log('✅ Antarctica forecast success');
    console.log(`❄️  Temperature: ${parsed.daily_forecast[0].temperature.min}°C`);
    console.log(`💨 Wind: ${parsed.daily_forecast[0].wind.max_speed} km/h`);
  } catch (error) {
    console.error('❌ Antarctica forecast failed:', error);
  }

  console.log('\n='.repeat(60));
  console.log('🎉 Forecast Tool testing completed!');
}

testForecastTool()
  .then(() => {
    console.log('\n✅ All forecast tests completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Forecast test failed with error:', error);
    process.exit(1);
  });