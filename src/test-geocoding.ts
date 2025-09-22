import { GeocodingTool } from './tools/geocoding.js';
import { GeocodingService } from './services/geocodingService.js';

async function testGeocodingService() {
  console.log('🌍 Testing Geocoding Service...');
  console.log('='.repeat(60));

  const service = new GeocodingService();

  // Test connection
  console.log('\n📡 Testing API connection...');
  const isConnected = await service.testConnection();
  if (!isConnected) {
    console.error('❌ Geocoding API connection failed!');
    return false;
  }

  // Test basic search
  console.log('\n🔍 Testing basic location search...');
  try {
    const results = await service.searchLocation({ name: 'Paris' });
    console.log(`✅ Found ${results.length} results for "Paris"`);
    if (results.length > 0) {
      const firstResult = results[0];
      if (firstResult) {
        console.log(`📍 First result: ${firstResult.name}, ${firstResult.country} (${firstResult.latitude}, ${firstResult.longitude})`);
      }
    }
  } catch (error) {
    console.error('❌ Basic search failed:', error);
    return false;
  }

  // Test cache
  console.log('\n💾 Testing cache functionality...');
  const start = Date.now();
  await service.searchLocation({ name: 'Paris' }); // This should use cache
  const cacheTime = Date.now() - start;
  console.log(`✅ Cache lookup took ${cacheTime}ms`);

  const stats = service.getCacheStats();
  console.log(`📊 Cache stats: ${stats.size}/${stats.maxSize} entries`);

  return true;
}

async function testGeocodingTool() {
  console.log('\n🛠️  Testing Geocoding Tool...');
  console.log('='.repeat(60));

  const tool = new GeocodingTool();

  const testCases = [
    {
      name: 'Simple city search',
      params: { location: 'Tokyo' },
      expectResults: true
    },
    {
      name: 'City with country filter',
      params: { location: 'Paris', country: 'France' },
      expectResults: true
    },
    {
      name: 'Multi-language search (German)',
      params: { location: 'München', language: 'de', max_results: 3 },
      expectResults: true
    },
    {
      name: 'Ambiguous location',
      params: { location: 'Springfield', max_results: 10 },
      expectResults: true
    },
    {
      name: 'Special characters',
      params: { location: 'São Paulo', country: 'Brazil' },
      expectResults: true
    },
    {
      name: 'Non-existent location',
      params: { location: 'Xyztownville' },
      expectResults: false
    },
    {
      name: 'Region search',
      params: { location: 'Normandy', country: 'France' },
      expectResults: true
    },
    {
      name: 'Country search',
      params: { location: 'Switzerland' },
      expectResults: true
    }
  ];

  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of testCases) {
    console.log(`\n📋 Test: ${testCase.name}`);
    console.log(`🎯 Params:`, testCase.params);

    try {
      const result = await tool.geocodeLocation(testCase.params);
      const parsed = JSON.parse(result);

      const hasResults = parsed.results && parsed.results.length > 0;

      if (testCase.expectResults === hasResults) {
        console.log(`✅ Test passed`);

        if (hasResults) {
          console.log(`📍 Best match: ${parsed.best_match?.full_name}`);
          console.log(`📊 Found ${parsed.total_found} total results`);

          if (parsed.suggestions.length > 0) {
            console.log(`💡 Suggestions: ${parsed.suggestions.slice(0, 2).join(', ')}`);
          }
        } else {
          console.log(`🔍 No results found (as expected)`);
        }

        passedTests++;
      } else {
        console.log(`❌ Test failed - expected ${testCase.expectResults ? 'results' : 'no results'} but got ${hasResults ? 'results' : 'no results'}`);
        failedTests++;
      }

    } catch (error) {
      console.error(`❌ Test failed with error:`, (error as Error).message);
      failedTests++;
    }

    // Small delay to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Geocoding Tool Test Results:');
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`📈 Success Rate: ${Math.round((passedTests / (passedTests + failedTests)) * 100)}%`);

  return failedTests === 0;
}

async function testErrorHandling() {
  console.log('\n⚠️  Testing Error Handling...');
  console.log('='.repeat(60));

  const tool = new GeocodingTool();

  const errorCases = [
    {
      name: 'Empty location',
      params: { location: '' },
      expectedError: true
    },
    {
      name: 'Too short location',
      params: { location: 'A' },
      expectedError: true
    },
    {
      name: 'Too long location',
      params: { location: 'A'.repeat(101) },
      expectedError: true
    },
    {
      name: 'Invalid language code',
      params: { location: 'Paris', language: 'english' },
      expectedError: true
    },
    {
      name: 'Invalid max_results (too high)',
      params: { location: 'Paris', max_results: 100 },
      expectedError: true
    },
    {
      name: 'Invalid max_results (too low)',
      params: { location: 'Paris', max_results: 0 },
      expectedError: true
    }
  ];

  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of errorCases) {
    console.log(`\n📋 Error Test: ${testCase.name}`);

    try {
      await tool.geocodeLocation(testCase.params);

      if (testCase.expectedError) {
        console.log(`❌ Expected error but request succeeded`);
        failedTests++;
      } else {
        console.log(`✅ Request succeeded as expected`);
        passedTests++;
      }

    } catch (error) {
      if (testCase.expectedError) {
        console.log(`✅ Correctly caught error: ${(error as Error).message}`);
        passedTests++;
      } else {
        console.log(`❌ Unexpected error: ${(error as Error).message}`);
        failedTests++;
      }
    }
  }

  console.log('\n📊 Error Handling Test Results:');
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);

  return failedTests === 0;
}

async function runAllTests() {
  console.log('🚀 Starting Geocoding Test Suite...');
  console.log('='.repeat(80));

  try {
    const serviceTest = await testGeocodingService();
    const toolTest = await testGeocodingTool();
    const errorTest = await testErrorHandling();

    console.log('\n' + '='.repeat(80));
    console.log('🏁 Final Results:');
    console.log(`🔧 Service Test: ${serviceTest ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`🛠️  Tool Test: ${toolTest ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`⚠️  Error Test: ${errorTest ? '✅ PASS' : '❌ FAIL'}`);

    if (serviceTest && toolTest && errorTest) {
      console.log('\n🎉 All geocoding tests passed successfully!');
      return true;
    } else {
      console.log('\n💥 Some tests failed. Check the implementation.');
      return false;
    }

  } catch (error) {
    console.error('\n💥 Test suite failed:', error);
    return false;
  }
}

runAllTests()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });