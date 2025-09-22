import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

interface TestResult {
  testName: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  duration: number;
  error?: string;
  response?: any;
}

interface TestSuite {
  suiteName: string;
  results: TestResult[];
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  totalDuration: number;
}

class MCPTester {
  private results: TestSuite[] = [];

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Comprehensive MCP Weather Server Tests');
    console.log('='.repeat(80));

    // Test server health first
    const healthSuite = await this.testServerHealth();
    this.results.push(healthSuite);

    // Test MCP tools listing
    const toolsSuite = await this.testMCPTools();
    this.results.push(toolsSuite);

    // Test individual tools
    const weatherSuite = await this.testCurrentWeather();
    this.results.push(weatherSuite);

    const forecastSuite = await this.testWeatherForecast();
    this.results.push(forecastSuite);

    const hourlySuite = await this.testHourlyForecast();
    this.results.push(hourlySuite);

    const geocodingSuite = await this.testGeocoding();
    this.results.push(geocodingSuite);

    // Test error scenarios
    const errorSuite = await this.testErrorScenarios();
    this.results.push(errorSuite);

    // Test performance
    const performanceSuite = await this.testPerformance();
    this.results.push(performanceSuite);

    // Test cache functionality
    const cacheSuite = await this.testCacheFunctionality();
    this.results.push(cacheSuite);

    // Print final report
    this.printFinalReport();
  }

  private async testServerHealth(): Promise<TestSuite> {
    const suite: TestSuite = {
      suiteName: 'Server Health Tests',
      results: [],
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      totalDuration: 0
    };

    console.log('\n🏥 Testing Server Health...');
    console.log('-'.repeat(50));

    // Test 1: Health endpoint
    const healthResult = await this.runTest('Health Endpoint', async () => {
      const response = await axios.get(`${BASE_URL}/health`);
      if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
      if (response.data.status !== 'ok') throw new Error('Health status not ok');
      return response.data;
    });
    suite.results.push(healthResult);

    // Test 2: Server responds to invalid endpoint
    const invalidResult = await this.runTest('Invalid Endpoint Returns 404', async () => {
      try {
        await axios.get(`${BASE_URL}/invalid-endpoint`);
        throw new Error('Should have returned 404');
      } catch (error: any) {
        if (error.response?.status === 404) {
          return { status: 404, message: 'Correctly returned 404' };
        }
        throw error;
      }
    });
    suite.results.push(invalidResult);

    this.calculateSuiteStats(suite);
    return suite;
  }

  private async testMCPTools(): Promise<TestSuite> {
    const suite: TestSuite = {
      suiteName: 'MCP Tools Tests',
      results: [],
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      totalDuration: 0
    };

    console.log('\n🔧 Testing MCP Tools...');
    console.log('-'.repeat(50));

    // Test 1: List available tools
    const listToolsResult = await this.runTest('List Available Tools', async () => {
      const response = await axios.get(`${BASE_URL}/mcp/tools`);
      if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
      if (!response.data.tools || !Array.isArray(response.data.tools)) {
        throw new Error('Tools array not found in response');
      }
      if (response.data.tools.length !== 4) {
        throw new Error(`Expected 4 tools, got ${response.data.tools.length}`);
      }

      const expectedTools = ['get_current_weather', 'get_weather_forecast', 'get_hourly_forecast', 'geocode_location'];
      const actualTools = response.data.tools.map((tool: any) => tool.name);

      for (const expectedTool of expectedTools) {
        if (!actualTools.includes(expectedTool)) {
          throw new Error(`Missing tool: ${expectedTool}`);
        }
      }

      return { toolCount: response.data.tools.length, tools: actualTools };
    });
    suite.results.push(listToolsResult);

    // Test 2: Tool schemas validation
    const schemaResult = await this.runTest('Tool Schemas Validation', async () => {
      const response = await axios.get(`${BASE_URL}/mcp/tools`);
      const tools = response.data.tools;

      for (const tool of tools) {
        if (!tool.name || !tool.description || !tool.inputSchema) {
          throw new Error(`Tool ${tool.name} missing required fields`);
        }

        if (!tool.inputSchema.type || !tool.inputSchema.properties) {
          throw new Error(`Tool ${tool.name} has invalid schema`);
        }
      }

      return { validatedTools: tools.length };
    });
    suite.results.push(schemaResult);

    this.calculateSuiteStats(suite);
    return suite;
  }

  private async testCurrentWeather(): Promise<TestSuite> {
    const suite: TestSuite = {
      suiteName: 'Current Weather Tests',
      results: [],
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      totalDuration: 0
    };

    console.log('\n🌤️ Testing Current Weather Tool...');
    console.log('-'.repeat(50));

    // Test 1: Valid coordinates (Paris)
    const parisResult = await this.runTest('Paris Weather', async () => {
      const response = await axios.post(`${BASE_URL}/mcp/call`, {
        name: 'get_current_weather',
        arguments: {
          latitude: 48.8566,
          longitude: 2.3522,
          timezone: 'Europe/Paris',
          temperature_unit: 'celsius'
        }
      });

      if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);

      const data = JSON.parse(response.data.content[0].text);
      if (!data.location || !data.current_weather) {
        throw new Error('Missing location or current_weather data');
      }

      if (typeof data.current_weather.temperature !== 'number') {
        throw new Error('Temperature should be a number');
      }

      return {
        temperature: data.current_weather.temperature,
        location: `${data.location.latitude}, ${data.location.longitude}`,
        timezone: data.location.timezone
      };
    });
    suite.results.push(parisResult);

    // Test 2: Different temperature unit (Fahrenheit)
    const fahrenheitResult = await this.runTest('Temperature Unit (Fahrenheit)', async () => {
      const response = await axios.post(`${BASE_URL}/mcp/call`, {
        name: 'get_current_weather',
        arguments: {
          latitude: 40.7128,
          longitude: -74.0060,
          temperature_unit: 'fahrenheit'
        }
      });

      const data = JSON.parse(response.data.content[0].text);
      const tempF = data.current_weather.temperature;

      // Fahrenheit should be roughly between -50 and 150 for realistic weather
      if (tempF < -50 || tempF > 150) {
        throw new Error(`Unrealistic Fahrenheit temperature: ${tempF}`);
      }

      return { temperatureF: tempF, location: 'New York' };
    });
    suite.results.push(fahrenheitResult);

    // Test 3: Auto timezone
    const autoTimezoneResult = await this.runTest('Auto Timezone Detection', async () => {
      const response = await axios.post(`${BASE_URL}/mcp/call`, {
        name: 'get_current_weather',
        arguments: {
          latitude: 35.6762,
          longitude: 139.6503,
          timezone: 'auto'
        }
      });

      const data = JSON.parse(response.data.content[0].text);
      if (!data.location.timezone.includes('Asia') && !data.location.timezone.includes('Tokyo')) {
        throw new Error(`Expected Asian timezone for Tokyo, got: ${data.location.timezone}`);
      }

      return { detectedTimezone: data.location.timezone };
    });
    suite.results.push(autoTimezoneResult);

    // Test 4: Edge case - Extreme coordinates
    const extremeResult = await this.runTest('Extreme Coordinates (Antarctica)', async () => {
      const response = await axios.post(`${BASE_URL}/mcp/call`, {
        name: 'get_current_weather',
        arguments: {
          latitude: -89.9,
          longitude: 0,
        }
      });

      const data = JSON.parse(response.data.content[0].text);
      // Should work even for extreme locations
      if (!data.current_weather || typeof data.current_weather.temperature !== 'number') {
        throw new Error('Should return valid weather data even for extreme locations');
      }

      return { extremeLocation: true, temperature: data.current_weather.temperature };
    });
    suite.results.push(extremeResult);

    this.calculateSuiteStats(suite);
    return suite;
  }

  private async testWeatherForecast(): Promise<TestSuite> {
    const suite: TestSuite = {
      suiteName: 'Weather Forecast Tests',
      results: [],
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      totalDuration: 0
    };

    console.log('\n📅 Testing Weather Forecast Tool...');
    console.log('-'.repeat(50));

    // Test 1: 5-day forecast
    const fiveDayResult = await this.runTest('5-Day Forecast', async () => {
      const response = await axios.post(`${BASE_URL}/mcp/call`, {
        name: 'get_weather_forecast',
        arguments: {
          latitude: 51.5074,
          longitude: -0.1278,
          days: 5,
          timezone: 'Europe/London'
        }
      });

      const data = JSON.parse(response.data.content[0].text);
      if (!data.forecast || !data.forecast.daily) {
        throw new Error('Missing forecast daily data');
      }

      const daily = data.forecast.daily;
      if (!daily.time || daily.time.length !== 5) {
        throw new Error(`Expected 5 days, got ${daily.time?.length}`);
      }

      if (!daily.temperature_2m_max || !daily.temperature_2m_min) {
        throw new Error('Missing temperature data');
      }

      return {
        days: daily.time.length,
        firstDay: daily.time[0],
        maxTemp: daily.temperature_2m_max[0],
        minTemp: daily.temperature_2m_min[0]
      };
    });
    suite.results.push(fiveDayResult);

    // Test 2: Maximum days (7)
    const maxDaysResult = await this.runTest('Maximum Days (7)', async () => {
      const response = await axios.post(`${BASE_URL}/mcp/call`, {
        name: 'get_weather_forecast',
        arguments: {
          latitude: -33.8688,
          longitude: 151.2093,
          days: 7
        }
      });

      const data = JSON.parse(response.data.content[0].text);
      const timeArray = data.forecast.daily.time;

      if (timeArray.length !== 7) {
        throw new Error(`Expected 7 days, got ${timeArray.length}`);
      }

      return { days: timeArray.length, location: 'Sydney' };
    });
    suite.results.push(maxDaysResult);

    // Test 3: Minimum days (1)
    const minDaysResult = await this.runTest('Minimum Days (1)', async () => {
      const response = await axios.post(`${BASE_URL}/mcp/call`, {
        name: 'get_weather_forecast',
        arguments: {
          latitude: 52.5200,
          longitude: 13.4050,
          days: 1
        }
      });

      const data = JSON.parse(response.data.content[0].text);
      const timeArray = data.forecast.daily.time;

      if (timeArray.length !== 1) {
        throw new Error(`Expected 1 day, got ${timeArray.length}`);
      }

      return { days: timeArray.length, location: 'Berlin' };
    });
    suite.results.push(minDaysResult);

    this.calculateSuiteStats(suite);
    return suite;
  }

  private async testHourlyForecast(): Promise<TestSuite> {
    const suite: TestSuite = {
      suiteName: 'Hourly Forecast Tests',
      results: [],
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      totalDuration: 0
    };

    console.log('\n⏰ Testing Hourly Forecast Tool...');
    console.log('-'.repeat(50));

    // Test 1: 1-day hourly forecast
    const oneDayResult = await this.runTest('1-Day Hourly Forecast', async () => {
      const response = await axios.post(`${BASE_URL}/mcp/call`, {
        name: 'get_hourly_forecast',
        arguments: {
          latitude: 37.7749,
          longitude: -122.4194,
          forecast_days: 1,
          timezone: 'America/Los_Angeles'
        }
      });

      const data = JSON.parse(response.data.content[0].text);
      if (!data.hourly_forecast || !data.hourly_forecast.time) {
        throw new Error('Missing hourly forecast data');
      }

      const hourlyData = data.hourly_forecast;
      // Should have 24 hours for 1 day
      if (hourlyData.time.length !== 24) {
        throw new Error(`Expected 24 hours, got ${hourlyData.time.length}`);
      }

      return {
        hours: hourlyData.time.length,
        firstHour: hourlyData.time[0],
        location: 'San Francisco'
      };
    });
    suite.results.push(oneDayResult);

    // Test 2: 3-day hourly forecast
    const threeDayResult = await this.runTest('3-Day Hourly Forecast', async () => {
      const response = await axios.post(`${BASE_URL}/mcp/call`, {
        name: 'get_hourly_forecast',
        arguments: {
          latitude: 48.8566,
          longitude: 2.3522,
          forecast_days: 3
        }
      });

      const data = JSON.parse(response.data.content[0].text);
      const hourlyData = data.hourly_forecast;

      // Should have 72 hours for 3 days
      if (hourlyData.time.length !== 72) {
        throw new Error(`Expected 72 hours, got ${hourlyData.time.length}`);
      }

      return { hours: hourlyData.time.length, location: 'Paris' };
    });
    suite.results.push(threeDayResult);

    this.calculateSuiteStats(suite);
    return suite;
  }

  private async testGeocoding(): Promise<TestSuite> {
    const suite: TestSuite = {
      suiteName: 'Geocoding Tests',
      results: [],
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      totalDuration: 0
    };

    console.log('\n🗺️ Testing Geocoding Tool...');
    console.log('-'.repeat(50));

    // Test 1: Simple city search
    const cityResult = await this.runTest('Simple City Search (Paris)', async () => {
      const response = await axios.post(`${BASE_URL}/mcp/call`, {
        name: 'geocode_location',
        arguments: {
          location: 'Paris',
          country: 'France',
          max_results: 1
        }
      });

      const data = JSON.parse(response.data.content[0].text);
      if (!data.results || data.results.length === 0) {
        throw new Error('No geocoding results found');
      }

      const result = data.results[0];
      if (!result.latitude || !result.longitude || !result.name) {
        throw new Error('Missing coordinate data');
      }

      // Paris should be around 48.8566, 2.3522
      if (Math.abs(result.latitude - 48.8566) > 0.1 || Math.abs(result.longitude - 2.3522) > 0.1) {
        throw new Error(`Coordinates for Paris seem incorrect: ${result.latitude}, ${result.longitude}`);
      }

      return {
        name: result.name,
        coordinates: `${result.latitude}, ${result.longitude}`,
        country: result.country
      };
    });
    suite.results.push(cityResult);

    // Test 2: Ambiguous location
    const ambiguousResult = await this.runTest('Ambiguous Location (Springfield)', async () => {
      const response = await axios.post(`${BASE_URL}/mcp/call`, {
        name: 'geocode_location',
        arguments: {
          location: 'Springfield',
          max_results: 5
        }
      });

      const data = JSON.parse(response.data.content[0].text);
      if (!data.results || data.results.length < 2) {
        throw new Error('Should return multiple results for ambiguous location');
      }

      // Should have different states/countries
      const countries = new Set(data.results.map((r: any) => r.country));
      const states = new Set(data.results.map((r: any) => r.admin1));

      return {
        resultCount: data.results.length,
        countries: Array.from(countries),
        states: Array.from(states).slice(0, 3) // Just first 3 for display
      };
    });
    suite.results.push(ambiguousResult);

    // Test 3: Non-English search
    const nonEnglishResult = await this.runTest('Non-English Search (Tokyo)', async () => {
      const response = await axios.post(`${BASE_URL}/mcp/call`, {
        name: 'geocode_location',
        arguments: {
          location: '東京',
          language: 'ja',
          max_results: 1
        }
      });

      const data = JSON.parse(response.data.content[0].text);
      if (!data.results || data.results.length === 0) {
        throw new Error('No results for Japanese location search');
      }

      const result = data.results[0];
      // Tokyo should be around 35.6762, 139.6503
      if (Math.abs(result.latitude - 35.6762) > 0.1 || Math.abs(result.longitude - 139.6503) > 0.1) {
        throw new Error(`Coordinates for Tokyo seem incorrect: ${result.latitude}, ${result.longitude}`);
      }

      return {
        name: result.name,
        coordinates: `${result.latitude}, ${result.longitude}`,
        searchTerm: '東京'
      };
    });
    suite.results.push(nonEnglishResult);

    // Test 4: Invalid location
    const invalidResult = await this.runTest('Invalid Location', async () => {
      const response = await axios.post(`${BASE_URL}/mcp/call`, {
        name: 'geocode_location',
        arguments: {
          location: 'ZZZ Invalid City Name XYZ',
          max_results: 1
        }
      });

      const data = JSON.parse(response.data.content[0].text);
      if (data.results && data.results.length > 0) {
        throw new Error('Should not find results for invalid location');
      }

      return { message: 'Correctly returned no results for invalid location' };
    });
    suite.results.push(invalidResult);

    this.calculateSuiteStats(suite);
    return suite;
  }

  private async testErrorScenarios(): Promise<TestSuite> {
    const suite: TestSuite = {
      suiteName: 'Error Scenario Tests',
      results: [],
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      totalDuration: 0
    };

    console.log('\n🚨 Testing Error Scenarios...');
    console.log('-'.repeat(50));

    // Test 1: Invalid coordinates
    const invalidCoordsResult = await this.runTest('Invalid Coordinates', async () => {
      try {
        await axios.post(`${BASE_URL}/mcp/call`, {
          name: 'get_current_weather',
          arguments: {
            latitude: 91, // Invalid latitude > 90
            longitude: 200 // Invalid longitude > 180
          }
        });
        throw new Error('Should have returned error for invalid coordinates');
      } catch (error: any) {
        if (error.response?.status >= 400 && error.response?.status < 500) {
          return { status: error.response.status, message: 'Correctly rejected invalid coordinates' };
        }
        throw error;
      }
    });
    suite.results.push(invalidCoordsResult);

    // Test 2: Unknown tool
    const unknownToolResult = await this.runTest('Unknown Tool', async () => {
      try {
        await axios.post(`${BASE_URL}/mcp/call`, {
          name: 'invalid_tool_name',
          arguments: {}
        });
        throw new Error('Should have returned error for unknown tool');
      } catch (error: any) {
        if (error.response?.status >= 400 && error.response?.status < 500) {
          return { status: error.response.status, message: 'Correctly rejected unknown tool' };
        }
        throw error;
      }
    });
    suite.results.push(unknownToolResult);

    // Test 3: Missing required parameters
    const missingParamsResult = await this.runTest('Missing Required Parameters', async () => {
      try {
        await axios.post(`${BASE_URL}/mcp/call`, {
          name: 'get_current_weather',
          arguments: {
            // Missing latitude and longitude
            timezone: 'UTC'
          }
        });
        throw new Error('Should have returned error for missing parameters');
      } catch (error: any) {
        if (error.response?.status >= 400 && error.response?.status < 500) {
          return { status: error.response.status, message: 'Correctly rejected missing parameters' };
        }
        throw error;
      }
    });
    suite.results.push(missingParamsResult);

    // Test 4: Invalid forecast days
    const invalidDaysResult = await this.runTest('Invalid Forecast Days', async () => {
      try {
        await axios.post(`${BASE_URL}/mcp/call`, {
          name: 'get_weather_forecast',
          arguments: {
            latitude: 48.8566,
            longitude: 2.3522,
            days: 10 // Invalid, max is 7
          }
        });
        throw new Error('Should have returned error for invalid days');
      } catch (error: any) {
        if (error.response?.status >= 400 && error.response?.status < 500) {
          return { status: error.response.status, message: 'Correctly rejected invalid days parameter' };
        }
        throw error;
      }
    });
    suite.results.push(invalidDaysResult);

    // Test 5: Invalid JSON in request
    const invalidJsonResult = await this.runTest('Invalid JSON Request', async () => {
      try {
        await axios.post(`${BASE_URL}/mcp/call`, 'invalid json', {
          headers: { 'Content-Type': 'application/json' }
        });
        throw new Error('Should have returned error for invalid JSON');
      } catch (error: any) {
        if (error.response?.status >= 400 && error.response?.status < 500) {
          return { status: error.response.status, message: 'Correctly rejected invalid JSON' };
        }
        throw error;
      }
    });
    suite.results.push(invalidJsonResult);

    this.calculateSuiteStats(suite);
    return suite;
  }

  private async testPerformance(): Promise<TestSuite> {
    const suite: TestSuite = {
      suiteName: 'Performance Tests',
      results: [],
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      totalDuration: 0
    };

    console.log('\n⚡ Testing Performance...');
    console.log('-'.repeat(50));

    // Test 1: Response time benchmarks
    const responseTimeResult = await this.runTest('Response Time Benchmark', async () => {
      const testCalls = [
        { name: 'get_current_weather', args: { latitude: 48.8566, longitude: 2.3522 } },
        { name: 'get_weather_forecast', args: { latitude: 48.8566, longitude: 2.3522, days: 3 } },
        { name: 'get_hourly_forecast', args: { latitude: 48.8566, longitude: 2.3522, forecast_days: 1 } },
        { name: 'geocode_location', args: { location: 'Paris', max_results: 1 } }
      ];

      const results = [];
      for (const testCall of testCalls) {
        const start = Date.now();
        await axios.post(`${BASE_URL}/mcp/call`, {
          name: testCall.name,
          arguments: testCall.args
        });
        const duration = Date.now() - start;
        results.push({ tool: testCall.name, duration });
      }

      const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;

      if (avgDuration > 5000) {
        throw new Error(`Average response time too high: ${avgDuration}ms`);
      }

      return { avgDuration, results };
    });
    suite.results.push(responseTimeResult);

    // Test 2: Concurrent requests
    const concurrentResult = await this.runTest('Concurrent Requests', async () => {
      const concurrentCount = 5;
      const promises = Array(concurrentCount).fill(null).map(() =>
        axios.post(`${BASE_URL}/mcp/call`, {
          name: 'get_current_weather',
          arguments: { latitude: 48.8566, longitude: 2.3522 }
        })
      );

      const start = Date.now();
      const responses = await Promise.all(promises);
      const totalDuration = Date.now() - start;

      // All should succeed
      if (responses.some(r => r.status !== 200)) {
        throw new Error('Some concurrent requests failed');
      }

      const avgConcurrentTime = totalDuration / concurrentCount;

      return {
        concurrentRequests: concurrentCount,
        totalTime: totalDuration,
        avgTimePerRequest: avgConcurrentTime
      };
    });
    suite.results.push(concurrentResult);

    this.calculateSuiteStats(suite);
    return suite;
  }

  private async testCacheFunctionality(): Promise<TestSuite> {
    const suite: TestSuite = {
      suiteName: 'Cache Functionality Tests',
      results: [],
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      totalDuration: 0
    };

    console.log('\n💾 Testing Cache Functionality...');
    console.log('-'.repeat(50));

    // Test 1: Cache statistics endpoint
    const cacheStatsResult = await this.runTest('Cache Statistics Endpoint', async () => {
      const response = await axios.get(`${BASE_URL}/cache/stats`);

      if (response.status !== 200) {
        throw new Error(`Expected 200, got ${response.status}`);
      }

      const stats = response.data;
      if (typeof stats.hits !== 'number' || typeof stats.misses !== 'number') {
        throw new Error('Invalid cache statistics format');
      }

      return {
        hits: stats.hits,
        misses: stats.misses,
        entries: stats.entries,
        hitRate: stats.hitRate
      };
    });
    suite.results.push(cacheStatsResult);

    // Test 2: Cache clear functionality
    const cacheClearResult = await this.runTest('Cache Clear Functionality', async () => {
      // First make a request to populate cache
      await axios.post(`${BASE_URL}/mcp/call`, {
        name: 'get_current_weather',
        arguments: { latitude: 48.8566, longitude: 2.3522 }
      });

      // Clear cache
      const clearResponse = await axios.post(`${BASE_URL}/cache/clear`);

      if (clearResponse.status !== 200) {
        throw new Error(`Expected 200, got ${clearResponse.status}`);
      }

      const clearData = clearResponse.data;
      if (typeof clearData.entriesRemoved !== 'number') {
        throw new Error('Invalid cache clear response format');
      }

      // Check stats after clear
      const statsResponse = await axios.get(`${BASE_URL}/cache/stats`);
      if (statsResponse.data.entries !== 0) {
        throw new Error('Cache not properly cleared');
      }

      return {
        entriesRemoved: clearData.entriesRemoved,
        entriesAfterClear: statsResponse.data.entries
      };
    });
    suite.results.push(cacheClearResult);

    // Test 3: Cache hit/miss behavior
    const cacheHitMissResult = await this.runTest('Cache Hit/Miss Behavior', async () => {
      // Clear cache first
      await axios.post(`${BASE_URL}/cache/clear`);

      // First request should be a cache miss
      const firstResponse = await axios.post(`${BASE_URL}/mcp/call`, {
        name: 'get_current_weather',
        arguments: { latitude: 51.5074, longitude: -0.1278 }
      });

      const firstCacheStatus = firstResponse.headers['x-cache'];
      if (firstCacheStatus !== 'MISS') {
        throw new Error(`Expected cache MISS, got ${firstCacheStatus}`);
      }

      // Second identical request should be a cache hit
      const secondResponse = await axios.post(`${BASE_URL}/mcp/call`, {
        name: 'get_current_weather',
        arguments: { latitude: 51.5074, longitude: -0.1278 }
      });

      const secondCacheStatus = secondResponse.headers['x-cache'];
      if (secondCacheStatus !== 'HIT') {
        throw new Error(`Expected cache HIT, got ${secondCacheStatus}`);
      }

      return {
        firstRequest: firstCacheStatus,
        secondRequest: secondCacheStatus,
        improvement: 'Cache working correctly'
      };
    });
    suite.results.push(cacheHitMissResult);

    this.calculateSuiteStats(suite);
    return suite;
  }

  private async runTest(testName: string, testFunction: () => Promise<any>): Promise<TestResult> {
    const start = Date.now();

    try {
      const result = await testFunction();
      const duration = Date.now() - start;

      console.log(`✅ ${testName} - ${duration}ms`);

      return {
        testName,
        status: 'PASS',
        duration,
        response: result
      };
    } catch (error: any) {
      const duration = Date.now() - start;

      console.log(`❌ ${testName} - ${duration}ms - ${error.message}`);

      return {
        testName,
        status: 'FAIL',
        duration,
        error: error.message
      };
    }
  }

  private calculateSuiteStats(suite: TestSuite): void {
    suite.totalTests = suite.results.length;
    suite.passedTests = suite.results.filter(r => r.status === 'PASS').length;
    suite.failedTests = suite.results.filter(r => r.status === 'FAIL').length;
    suite.skippedTests = suite.results.filter(r => r.status === 'SKIP').length;
    suite.totalDuration = suite.results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`\n📊 ${suite.suiteName} Results:`);
    console.log(`   Tests: ${suite.totalTests} | Pass: ${suite.passedTests} | Fail: ${suite.failedTests} | Duration: ${suite.totalDuration}ms`);
  }

  private printFinalReport(): void {
    console.log('\n🎉 Final Test Report');
    console.log('='.repeat(80));

    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    let totalDuration = 0;

    for (const suite of this.results) {
      totalTests += suite.totalTests;
      totalPassed += suite.passedTests;
      totalFailed += suite.failedTests;
      totalDuration += suite.totalDuration;

      console.log(`\n📋 ${suite.suiteName}:`);
      console.log(`   ${suite.passedTests}/${suite.totalTests} tests passed (${((suite.passedTests/suite.totalTests)*100).toFixed(1)}%)`);

      if (suite.failedTests > 0) {
        const failedTests = suite.results.filter(r => r.status === 'FAIL');
        for (const test of failedTests) {
          console.log(`   ❌ ${test.testName}: ${test.error}`);
        }
      }
    }

    console.log(`\n🏆 Overall Results:`);
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   Passed: ${totalPassed}`);
    console.log(`   Failed: ${totalFailed}`);
    console.log(`   Success Rate: ${((totalPassed/totalTests)*100).toFixed(1)}%`);
    console.log(`   Total Duration: ${totalDuration}ms`);
    console.log(`   Average Test Duration: ${(totalDuration/totalTests).toFixed(1)}ms`);

    if (totalFailed === 0) {
      console.log('\n🎉 All tests passed! The MCP Weather Server is working perfectly.');
    } else {
      console.log(`\n⚠️  ${totalFailed} test(s) failed. Please review the errors above.`);
    }
  }
}

async function main() {
  const tester = new MCPTester();

  try {
    await tester.runAllTests();
    process.exit(0);
  } catch (error) {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  }
}

console.log('🔧 Make sure the server is running with: npm run dev');
console.log('⏳ Starting tests in 3 seconds...\n');

setTimeout(main, 3000);