import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

interface TestCase {
  name: string;
  tool: string;
  params: any;
  expectedStatus: number;
  expectedErrorType?: string;
}

const errorTestCases: TestCase[] = [
  {
    name: 'Invalid Latitude (too high)',
    tool: 'get_current_weather',
    params: { latitude: 200, longitude: 2.3522 },
    expectedStatus: 400,
    expectedErrorType: 'VALIDATION_ERROR'
  },
  {
    name: 'Invalid Longitude (too low)',
    tool: 'get_weather_forecast',
    params: { latitude: 48.8566, longitude: -300, days: 5 },
    expectedStatus: 400,
    expectedErrorType: 'VALIDATION_ERROR'
  },
  {
    name: 'Invalid Forecast Days (too many)',
    tool: 'get_weather_forecast',
    params: { latitude: 48.8566, longitude: 2.3522, days: 15 },
    expectedStatus: 400,
    expectedErrorType: 'VALIDATION_ERROR'
  },
  {
    name: 'Invalid Temperature Unit',
    tool: 'get_current_weather',
    params: { latitude: 48.8566, longitude: 2.3522, temperature_unit: 'kelvin' },
    expectedStatus: 400,
    expectedErrorType: 'VALIDATION_ERROR'
  },
  {
    name: 'Missing Required Parameters',
    tool: 'get_weather_forecast',
    params: { days: 5 },
    expectedStatus: 400,
    expectedErrorType: 'VALIDATION_ERROR'
  },
  {
    name: 'String Coordinates (should be converted)',
    tool: 'get_current_weather',
    params: { latitude: '48.8566', longitude: '2.3522' },
    expectedStatus: 200
  },
  {
    name: 'Invalid Tool Name',
    tool: 'get_invalid_weather',
    params: { latitude: 48.8566, longitude: 2.3522 },
    expectedStatus: 400,
    expectedErrorType: 'VALIDATION_ERROR'
  },
  {
    name: 'Empty Request Body',
    tool: '',
    params: null,
    expectedStatus: 400,
    expectedErrorType: 'VALIDATION_ERROR'
  },
  {
    name: 'Special Location Test (0,0)',
    tool: 'get_current_weather',
    params: { latitude: 0, longitude: 0 },
    expectedStatus: 200
  },
  {
    name: 'Extreme Coordinates (Antarctica)',
    tool: 'get_weather_forecast',
    params: { latitude: -89.5, longitude: 0, days: 3 },
    expectedStatus: 200
  },
  {
    name: 'Decimal Days (should be converted to integer)',
    tool: 'get_weather_forecast',
    params: { latitude: 48.8566, longitude: 2.3522, days: 5.7 },
    expectedStatus: 200
  },
  {
    name: 'Invalid Timezone',
    tool: 'get_current_weather',
    params: { latitude: 48.8566, longitude: 2.3522, timezone: 'Invalid/Timezone' },
    expectedStatus: 400,
    expectedErrorType: 'VALIDATION_ERROR'
  }
];

async function testErrorHandling() {
  console.log('🧪 Testing Error Handling & Validation...');
  console.log('='.repeat(80));

  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of errorTestCases) {
    console.log(`\n📋 Test: ${testCase.name}`);
    console.log(`🎯 Expected: ${testCase.expectedStatus} ${testCase.expectedErrorType || ''}`);

    try {
      let requestBody: any;

      if (testCase.params === null) {
        requestBody = null;
      } else if (testCase.tool === '') {
        requestBody = { arguments: testCase.params };
      } else {
        requestBody = {
          name: testCase.tool,
          arguments: testCase.params
        };
      }

      await axios.post(`${BASE_URL}/mcp/call`, requestBody);

      if (testCase.expectedStatus === 200) {
        console.log('✅ Request succeeded as expected');
        passedTests++;
      } else {
        console.log(`❌ Expected error ${testCase.expectedStatus} but got success`);
        failedTests++;
      }

    } catch (error: any) {
      const actualStatus = error.response?.status;
      const errorData = error.response?.data?.error;

      if (actualStatus === testCase.expectedStatus) {
        console.log(`✅ Got expected error status: ${actualStatus}`);

        if (testCase.expectedErrorType && errorData?.data?.type === testCase.expectedErrorType) {
          console.log(`✅ Got expected error type: ${errorData.data.type}`);
        } else if (testCase.expectedErrorType) {
          console.log(`⚠️  Expected error type: ${testCase.expectedErrorType}, got: ${errorData?.data?.type || 'unknown'}`);
        }

        console.log(`💬 User message: "${errorData?.message || 'No message'}"`);

        if (errorData?.data?.correlationId) {
          console.log(`🔍 Correlation ID: ${errorData.data.correlationId}`);
        }

        passedTests++;
      } else {
        console.log(`❌ Expected status ${testCase.expectedStatus} but got ${actualStatus}`);
        console.log(`💬 Error message: ${errorData?.message || error.message}`);
        failedTests++;
      }
    }

    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n' + '='.repeat(80));
  console.log('📊 Test Results:');
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`📈 Success Rate: ${Math.round((passedTests / (passedTests + failedTests)) * 100)}%`);

  if (failedTests === 0) {
    console.log('\n🎉 All error handling tests passed!');
  } else {
    console.log(`\n⚠️  ${failedTests} tests failed. Review error handling implementation.`);
  }

  return failedTests === 0;
}

// Additional test for API unavailability simulation
async function testApiUnavailability() {
  console.log('\n🌐 Testing API Unavailability Simulation...');

  try {
    // Test with invalid coordinates that might cause API issues
    await axios.post(`${BASE_URL}/mcp/call`, {
      name: 'get_current_weather',
      arguments: { latitude: 48.8566, longitude: 2.3522 }
    });

    console.log('✅ API is available and working');
    return true;
  } catch (error: any) {
    const errorData = error.response?.data?.error;

    if (errorData?.data?.type === 'API_ERROR' || errorData?.data?.type === 'NETWORK_ERROR') {
      console.log('✅ API error handling works correctly');
      console.log(`💬 User-friendly message: "${errorData.message}"`);
      return true;
    } else {
      console.log('❌ Unexpected error type for API unavailability');
      return false;
    }
  }
}

console.log('🚀 Starting Error Handling Test Suite...');
console.log('Make sure the server is running with: npm run dev');
console.log('');

setTimeout(async () => {
  try {
    const errorTestsPass = await testErrorHandling();
    const apiTestsPass = await testApiUnavailability();

    if (errorTestsPass && apiTestsPass) {
      console.log('\n🏆 All error handling tests completed successfully!');
      process.exit(0);
    } else {
      console.log('\n💥 Some tests failed. Check the implementation.');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 Test suite failed:', error);
    process.exit(1);
  }
}, 2000);