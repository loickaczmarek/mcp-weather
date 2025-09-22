#!/bin/bash

# MCP Weather Server - cURL Examples
# Make sure the server is running: npm run dev

BASE_URL="http://localhost:3000"

echo "🌤️  MCP Weather Server cURL Examples"
echo "======================================"

# Health Check
echo ""
echo "📡 Health Check"
echo "---------------"
curl -X GET "$BASE_URL/health" | jq '.'

# List Available Tools
echo ""
echo "🔧 List MCP Tools"
echo "-----------------"
curl -X GET "$BASE_URL/mcp/tools" | jq '.tools[].name'

# Current Weather Examples
echo ""
echo "🌡️  Current Weather Examples"
echo "----------------------------"

echo ""
echo "1. Paris, France (Celsius)"
curl -X POST "$BASE_URL/mcp/call" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "get_current_weather",
    "arguments": {
      "latitude": 48.8566,
      "longitude": 2.3522,
      "timezone": "Europe/Paris",
      "temperature_unit": "celsius"
    }
  }' | jq '.content[0].text | fromjson | .current_weather'

echo ""
echo "2. New York, USA (Fahrenheit)"
curl -X POST "$BASE_URL/mcp/call" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "get_current_weather",
    "arguments": {
      "latitude": 40.7128,
      "longitude": -74.0060,
      "timezone": "America/New_York",
      "temperature_unit": "fahrenheit"
    }
  }' | jq '.content[0].text | fromjson | .current_weather'

echo ""
echo "3. Tokyo, Japan (Auto timezone)"
curl -X POST "$BASE_URL/mcp/call" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "get_current_weather",
    "arguments": {
      "latitude": 35.6762,
      "longitude": 139.6503,
      "timezone": "auto"
    }
  }' | jq '.content[0].text | fromjson | .current_weather'

# Weather Forecast Examples
echo ""
echo "📅 Weather Forecast Examples"
echo "-----------------------------"

echo ""
echo "1. 5-day forecast for London"
curl -X POST "$BASE_URL/mcp/call" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "get_weather_forecast",
    "arguments": {
      "latitude": 51.5074,
      "longitude": -0.1278,
      "days": 5,
      "timezone": "Europe/London",
      "temperature_unit": "celsius"
    }
  }' | jq '.content[0].text | fromjson | .forecast.daily.time[:3]'

echo ""
echo "2. 3-day forecast for Sydney"
curl -X POST "$BASE_URL/mcp/call" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "get_weather_forecast",
    "arguments": {
      "latitude": -33.8688,
      "longitude": 151.2093,
      "days": 3,
      "timezone": "Australia/Sydney"
    }
  }' | jq '.content[0].text | fromjson | .forecast.daily.temperature_2m_max'

# Hourly Forecast Examples
echo ""
echo "⏰ Hourly Forecast Examples"
echo "---------------------------"

echo ""
echo "1. 24-hour forecast for Berlin"
curl -X POST "$BASE_URL/mcp/call" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "get_hourly_forecast",
    "arguments": {
      "latitude": 52.5200,
      "longitude": 13.4050,
      "forecast_days": 1,
      "timezone": "Europe/Berlin"
    }
  }' | jq '.content[0].text | fromjson | .hourly_forecast.time[:6]'

echo ""
echo "2. 3-day hourly forecast for San Francisco"
curl -X POST "$BASE_URL/mcp/call" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "get_hourly_forecast",
    "arguments": {
      "latitude": 37.7749,
      "longitude": -122.4194,
      "forecast_days": 3,
      "timezone": "America/Los_Angeles",
      "temperature_unit": "fahrenheit"
    }
  }' | jq '.content[0].text | fromjson | .hourly_forecast | keys'

# Geocoding Examples
echo ""
echo "🗺️  Geocoding Examples"
echo "----------------------"

echo ""
echo "1. Search for Paris (expect multiple results)"
curl -X POST "$BASE_URL/mcp/call" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "geocode_location",
    "arguments": {
      "location": "Paris",
      "max_results": 3
    }
  }' | jq '.content[0].text | fromjson | .results[] | {name, country, latitude, longitude}'

echo ""
echo "2. Search for Paris, France (specific)"
curl -X POST "$BASE_URL/mcp/call" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "geocode_location",
    "arguments": {
      "location": "Paris",
      "country": "France",
      "language": "en",
      "max_results": 1
    }
  }' | jq '.content[0].text | fromjson | .results[0]'

echo ""
echo "3. Search for Tokyo in Japanese"
curl -X POST "$BASE_URL/mcp/call" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "geocode_location",
    "arguments": {
      "location": "東京",
      "language": "ja",
      "max_results": 1
    }
  }' | jq '.content[0].text | fromjson | .results[0]'

echo ""
echo "4. Search for landmarks"
curl -X POST "$BASE_URL/mcp/call" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "geocode_location",
    "arguments": {
      "location": "Eiffel Tower",
      "country": "France",
      "max_results": 1
    }
  }' | jq '.content[0].text | fromjson | .results[0] | {name, latitude, longitude}'

# Cache Management Examples
echo ""
echo "💾 Cache Management Examples"
echo "-----------------------------"

echo ""
echo "1. Get cache statistics"
curl -X GET "$BASE_URL/cache/stats" | jq '{
  entries: .entries,
  hitRate: .hitRate,
  memoryUsage: (.memoryUsage / 1024 | round),
  typeBreakdown: .typeBreakdown
}'

echo ""
echo "2. Clear cache"
curl -X POST "$BASE_URL/cache/clear" | jq '.'

echo ""
echo "3. Cache statistics after clear"
curl -X GET "$BASE_URL/cache/stats" | jq '{entries: .entries, hitRate: .hitRate}'

# Performance Testing
echo ""
echo "⚡ Performance Testing"
echo "---------------------"

echo ""
echo "1. Test cache performance (run same request twice)"
echo "First request (cache miss):"
time curl -s -X POST "$BASE_URL/mcp/call" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "get_current_weather",
    "arguments": {
      "latitude": 48.8566,
      "longitude": 2.3522
    }
  }' > /dev/null

echo ""
echo "Second request (cache hit):"
time curl -s -X POST "$BASE_URL/mcp/call" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "get_current_weather",
    "arguments": {
      "latitude": 48.8566,
      "longitude": 2.3522
    }
  }' > /dev/null

# Error Examples
echo ""
echo "🚨 Error Examples"
echo "-----------------"

echo ""
echo "1. Invalid coordinates"
curl -X POST "$BASE_URL/mcp/call" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "get_current_weather",
    "arguments": {
      "latitude": 91,
      "longitude": 200
    }
  }' | jq '.error'

echo ""
echo "2. Missing required parameters"
curl -X POST "$BASE_URL/mcp/call" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "get_current_weather",
    "arguments": {}
  }' | jq '.error'

echo ""
echo "3. Unknown tool"
curl -X POST "$BASE_URL/mcp/call" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "invalid_tool",
    "arguments": {}
  }' | jq '.error'

echo ""
echo "✅ All examples completed!"
echo ""
echo "💡 Tips:"
echo "- Install jq for better JSON formatting: apt-get install jq"
echo "- Use 'time' command to measure response times"
echo "- Check server logs for detailed request tracking"
echo "- Monitor cache stats to optimize performance"