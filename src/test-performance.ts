import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

interface PerformanceMetrics {
  totalTime: number;
  cacheHits: number;
  cacheMisses: number;
  apiCalls: number;
  avgResponseTime: number;
  cacheHitRate: number;
}

async function testPerformance() {
  console.log('🚀 Testing Performance Optimizations...');
  console.log('='.repeat(80));

  const metrics: PerformanceMetrics = {
    totalTime: 0,
    cacheHits: 0,
    cacheMisses: 0,
    apiCalls: 0,
    avgResponseTime: 0,
    cacheHitRate: 0
  };

  // Test locations
  const testLocations = [
    { name: 'Paris', lat: 48.8566, lon: 2.3522 },
    { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
    { name: 'New York', lat: 40.7128, lon: -74.0060 },
    { name: 'London', lat: 51.5074, lon: -0.1278 },
    { name: 'Sydney', lat: -33.8688, lon: 151.2093 }
  ];

  console.log('\n📊 Baseline Performance Test (Cold Cache)');
  console.log('-'.repeat(60));

  const coldStartTimes: number[] = [];

  // Cold cache test - first requests
  for (const location of testLocations) {
    console.log(`\n🌍 Testing ${location.name} (${location.lat}, ${location.lon})`);

    const start = Date.now();
    try {
      const response = await axios.post(`${BASE_URL}/mcp/call`, {
        name: 'get_current_weather',
        arguments: {
          latitude: location.lat,
          longitude: location.lon,
          timezone: 'auto'
        }
      });

      const responseTime = Date.now() - start;
      coldStartTimes.push(responseTime);

      const cacheStatus = response.headers['x-cache'] || 'UNKNOWN';
      const serverTime = response.headers['x-response-time'] || 'N/A';

      console.log(`⏱️  Response time: ${responseTime}ms`);
      console.log(`💾 Cache status: ${cacheStatus}`);
      console.log(`🖥️  Server time: ${serverTime}`);

      if (cacheStatus === 'MISS') {
        metrics.cacheMisses++;
        metrics.apiCalls++;
      } else if (cacheStatus === 'HIT') {
        metrics.cacheHits++;
      }

    } catch (error) {
      console.error(`❌ Failed to test ${location.name}:`, (error as any).message);
    }

    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n🔥 Warm Cache Performance Test');
  console.log('-'.repeat(60));

  const warmCacheTimes: number[] = [];

  // Warm cache test - repeat the same requests
  for (const location of testLocations) {
    console.log(`\n🌍 Re-testing ${location.name} (should be cached)`);

    const start = Date.now();
    try {
      const response = await axios.post(`${BASE_URL}/mcp/call`, {
        name: 'get_current_weather',
        arguments: {
          latitude: location.lat,
          longitude: location.lon,
          timezone: 'auto'
        }
      });

      const responseTime = Date.now() - start;
      warmCacheTimes.push(responseTime);

      const cacheStatus = response.headers['x-cache'] || 'UNKNOWN';
      const serverTime = response.headers['x-response-time'] || 'N/A';

      console.log(`⏱️  Response time: ${responseTime}ms`);
      console.log(`💾 Cache status: ${cacheStatus}`);
      console.log(`🖥️  Server time: ${serverTime}`);

      if (cacheStatus === 'MISS') {
        metrics.cacheMisses++;
        metrics.apiCalls++;
      } else if (cacheStatus === 'HIT') {
        metrics.cacheHits++;
      }

    } catch (error) {
      console.error(`❌ Failed to re-test ${location.name}:`, (error as any).message);
    }

    await new Promise(resolve => setTimeout(resolve, 50));
  }

  console.log('\n📈 Forecast Performance Test');
  console.log('-'.repeat(60));

  const forecastTimes: number[] = [];

  // Test forecast caching
  for (const location of testLocations.slice(0, 3)) {
    console.log(`\n📅 Testing forecast for ${location.name}`);

    const start = Date.now();
    try {
      const response = await axios.post(`${BASE_URL}/mcp/call`, {
        name: 'get_weather_forecast',
        arguments: {
          latitude: location.lat,
          longitude: location.lon,
          days: 5,
          timezone: 'auto'
        }
      });

      const responseTime = Date.now() - start;
      forecastTimes.push(responseTime);

      const cacheStatus = response.headers['x-cache'] || 'UNKNOWN';
      const serverTime = response.headers['x-response-time'] || 'N/A';

      console.log(`⏱️  Response time: ${responseTime}ms`);
      console.log(`💾 Cache status: ${cacheStatus}`);
      console.log(`🖥️  Server time: ${serverTime}`);

      if (cacheStatus === 'MISS') {
        metrics.cacheMisses++;
        metrics.apiCalls++;
      } else if (cacheStatus === 'HIT') {
        metrics.cacheHits++;
      }

    } catch (error) {
      console.error(`❌ Failed to test forecast for ${location.name}:`, (error as any).message);
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n🔄 Cache Effectiveness Test');
  console.log('-'.repeat(60));

  // Repeat forecast requests to test cache effectiveness
  for (const location of testLocations.slice(0, 3)) {
    console.log(`\n📅 Re-testing forecast for ${location.name} (should be cached)`);

    const start = Date.now();
    try {
      const response = await axios.post(`${BASE_URL}/mcp/call`, {
        name: 'get_weather_forecast',
        arguments: {
          latitude: location.lat,
          longitude: location.lon,
          days: 5,
          timezone: 'auto'
        }
      });

      const responseTime = Date.now() - start;

      const cacheStatus = response.headers['x-cache'] || 'UNKNOWN';
      const serverTime = response.headers['x-response-time'] || 'N/A';

      console.log(`⏱️  Response time: ${responseTime}ms`);
      console.log(`💾 Cache status: ${cacheStatus}`);
      console.log(`🖥️  Server time: ${serverTime}`);

      if (cacheStatus === 'MISS') {
        metrics.cacheMisses++;
        metrics.apiCalls++;
      } else if (cacheStatus === 'HIT') {
        metrics.cacheHits++;
      }

    } catch (error) {
      console.error(`❌ Failed to re-test forecast for ${location.name}:`, (error as any).message);
    }

    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // Get cache statistics
  console.log('\n📊 Cache Statistics');
  console.log('-'.repeat(60));

  try {
    const statsResponse = await axios.get(`${BASE_URL}/cache/stats`);
    const cacheStats = statsResponse.data;

    console.log(`💾 Cache entries: ${cacheStats.entries}`);
    console.log(`🎯 Hit rate: ${(cacheStats.hitRate * 100).toFixed(1)}%`);
    console.log(`📈 Hits: ${cacheStats.hits}`);
    console.log(`📉 Misses: ${cacheStats.misses}`);
    console.log(`🗄️  Memory usage: ${(cacheStats.memoryUsage / 1024).toFixed(1)} KB`);
    console.log(`⚡ Avg access time: ${cacheStats.avgAccessTime.toFixed(2)}ms`);

    if (cacheStats.typeBreakdown) {
      console.log('\n📋 Cache breakdown by type:');
      for (const [type, count] of Object.entries(cacheStats.typeBreakdown)) {
        console.log(`  • ${type}: ${count} entries`);
      }
    }

  } catch (error) {
    console.error('❌ Failed to get cache stats:', (error as any).message);
  }

  // Calculate performance improvements
  console.log('\n🏆 Performance Analysis');
  console.log('='.repeat(80));

  const avgColdTime = coldStartTimes.reduce((a, b) => a + b, 0) / coldStartTimes.length;
  const avgWarmTime = warmCacheTimes.reduce((a, b) => a + b, 0) / warmCacheTimes.length;
  const avgForecastTime = forecastTimes.reduce((a, b) => a + b, 0) / forecastTimes.length;

  const improvement = ((avgColdTime - avgWarmTime) / avgColdTime) * 100;

  console.log(`🕒 Average cold cache time: ${avgColdTime.toFixed(1)}ms`);
  console.log(`🔥 Average warm cache time: ${avgWarmTime.toFixed(1)}ms`);
  console.log(`📅 Average forecast time: ${avgForecastTime.toFixed(1)}ms`);
  console.log(`📈 Cache improvement: ${improvement.toFixed(1)}% faster`);

  metrics.cacheHitRate = (metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses)) * 100;
  metrics.avgResponseTime = (avgColdTime + avgWarmTime) / 2;

  console.log('\n📊 Final Metrics:');
  console.log(`🎯 Cache hit rate: ${metrics.cacheHitRate.toFixed(1)}%`);
  console.log(`🔥 Cache hits: ${metrics.cacheHits}`);
  console.log(`❄️  Cache misses: ${metrics.cacheMisses}`);
  console.log(`🌐 API calls made: ${metrics.apiCalls}`);
  console.log(`⚡ Average response time: ${metrics.avgResponseTime.toFixed(1)}ms`);

  // Performance recommendations
  console.log('\n💡 Performance Recommendations:');
  if (metrics.cacheHitRate < 50) {
    console.log('⚠️  Low cache hit rate. Consider increasing cache TTL or implementing preloading.');
  } else if (metrics.cacheHitRate > 80) {
    console.log('✅ Excellent cache hit rate! Cache is working effectively.');
  } else {
    console.log('👍 Good cache hit rate. Room for improvement with preloading popular locations.');
  }

  if (avgWarmTime > 100) {
    console.log('⚠️  Cached responses are still slow. Check cache lookup performance.');
  } else {
    console.log('✅ Fast cached responses! Cache lookup is optimized.');
  }

  return metrics;
}

async function testLoadPerformance() {
  console.log('\n🔀 Load Testing...');
  console.log('-'.repeat(60));

  const concurrentRequests = 10;
  const paris = { lat: 48.8566, lon: 2.3522 };

  console.log(`🚀 Making ${concurrentRequests} concurrent requests for Paris weather...`);

  const start = Date.now();

  const promises = Array.from({ length: concurrentRequests }, async (_, index) => {
    try {
      const response = await axios.post(`${BASE_URL}/mcp/call`, {
        name: 'get_current_weather',
        arguments: {
          latitude: paris.lat,
          longitude: paris.lon,
          timezone: 'Europe/Paris'
        }
      });

      return {
        index,
        responseTime: Date.now() - start,
        cacheStatus: response.headers['x-cache'] || 'UNKNOWN',
        success: true
      };
    } catch (error) {
      return {
        index,
        responseTime: Date.now() - start,
        cacheStatus: 'ERROR',
        success: false,
        error: (error as any).message
      };
    }
  });

  const results = await Promise.all(promises);
  const totalTime = Date.now() - start;

  const successful = results.filter(r => r.success);
  const cacheHits = results.filter(r => r.cacheStatus === 'HIT').length;

  console.log(`⏱️  Total time for ${concurrentRequests} requests: ${totalTime}ms`);
  console.log(`✅ Successful requests: ${successful.length}/${concurrentRequests}`);
  console.log(`💾 Cache hits: ${cacheHits}/${concurrentRequests}`);
  console.log(`📈 Requests per second: ${(concurrentRequests / (totalTime / 1000)).toFixed(1)}`);

  return {
    concurrentRequests,
    totalTime,
    successfulRequests: successful.length,
    cacheHits,
    requestsPerSecond: concurrentRequests / (totalTime / 1000)
  };
}

async function runPerformanceTests() {
  try {
    const performanceMetrics = await testPerformance();
    const loadMetrics = await testLoadPerformance();

    console.log('\n🎉 Performance Testing Complete!');
    console.log('='.repeat(80));
    console.log('Summary:');
    console.log(`• Cache effectiveness: ${performanceMetrics.cacheHitRate.toFixed(1)}%`);
    console.log(`• API calls reduced: ${(100 - (performanceMetrics.apiCalls / (performanceMetrics.cacheHits + performanceMetrics.cacheMisses) * 100)).toFixed(1)}%`);
    console.log(`• Concurrent performance: ${loadMetrics.requestsPerSecond.toFixed(1)} req/s`);

    return { performanceMetrics, loadMetrics };

  } catch (error) {
    console.error('💥 Performance test failed:', error);
    throw error;
  }
}

console.log('🔧 Make sure the server is running with: npm run dev');
console.log('');

setTimeout(() => {
  runPerformanceTests()
    .then(() => {
      console.log('\n✅ All performance tests completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Performance tests failed:', error);
      process.exit(1);
    });
}, 2000);