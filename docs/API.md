# 🌤️ MCP Weather Server - API Documentation

Complete API documentation for the MCP Weather Server, providing comprehensive weather data through the Model Context Protocol.

## Table of Contents

- [Overview](#overview)
- [Protocol](#protocol)
- [Authentication](#authentication)
- [Endpoints](#endpoints)
- [MCP Tools](#mcp-tools)
- [Error Handling](#error-handling)
- [Code Examples](#code-examples)
- [Rate Limiting](#rate-limiting)
- [Caching](#caching)

## Overview

The MCP Weather Server implements the Model Context Protocol (MCP) over HTTP, providing weather data services through a RESTful API. The server exposes weather forecasting, current conditions, and geocoding capabilities via standardized MCP tool calls.

### Base URL
```
http://localhost:3000
```

### API Version
Current version: **1.0.0**

## Protocol

The server implements the Model Context Protocol (MCP) specification with JSON-RPC 2.0 messaging over HTTP.

### Request Format
All tool calls use POST requests to `/mcp/call` with the following structure:

```json
{
  "name": "tool_name",
  "arguments": {
    "parameter1": "value1",
    "parameter2": "value2"
  }
}
```

### Response Format
Successful responses follow the MCP format:

```json
{
  "content": [
    {
      "type": "text",
      "text": "JSON-formatted response data"
    }
  ]
}
```

### Error Format
Error responses include detailed error information:

```json
{
  "error": {
    "code": 400,
    "message": "Validation error description",
    "data": {
      "type": "validation_error",
      "timestamp": "2025-09-22T10:00:00.000Z",
      "correlationId": "abc123"
    }
  }
}
```

## Authentication

Currently, the API does not require authentication. All endpoints are publicly accessible.

**Future Considerations:**
- API key authentication
- Rate limiting per client
- Usage analytics

## Endpoints

### Health & Status

#### GET /health
Check server health and availability.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-09-22T10:00:00.000Z",
  "version": "1.0.0"
}
```

#### GET /ready
Kubernetes/Docker readiness probe.

**Response:**
```json
{
  "status": "ready",
  "timestamp": "2025-09-22T10:00:00.000Z",
  "uptime": 3600.123,
  "config": {
    "nodeEnv": "development",
    "cacheEnabled": true,
    "version": "1.0.0"
  }
}
```

#### GET /live
Kubernetes/Docker liveness probe.

**Response:**
```json
{
  "status": "alive",
  "timestamp": "2025-09-22T10:00:00.000Z",
  "pid": 12345,
  "memory": {
    "rss": 45678912,
    "heapTotal": 23456789,
    "heapUsed": 12345678,
    "external": 1234567
  },
  "uptime": 3600.123
}
```

### MCP Protocol

#### GET /mcp/tools
List all available MCP tools.

**Response:**
```json
{
  "tools": [
    {
      "name": "get_current_weather",
      "description": "Get real-time weather conditions...",
      "inputSchema": {
        "type": "object",
        "properties": {
          "latitude": {
            "type": "number",
            "minimum": -90,
            "maximum": 90,
            "description": "Latitude coordinate in decimal degrees"
          },
          "longitude": {
            "type": "number",
            "minimum": -180,
            "maximum": 180,
            "description": "Longitude coordinate in decimal degrees"
          }
        },
        "required": ["latitude", "longitude"]
      }
    }
  ]
}
```

#### POST /mcp/call
Execute an MCP tool.

**Request Body:**
```json
{
  "name": "tool_name",
  "arguments": {
    "parameter1": "value1"
  }
}
```

### Cache Management

#### GET /cache/stats
Get cache performance statistics.

**Response:**
```json
{
  "hitRate": 0.752,
  "entries": 247,
  "maxSize": 1000,
  "ttl": {
    "current_weather": 600,
    "forecast": 3600,
    "hourly_forecast": 1800,
    "geocoding": 7200
  },
  "performance": {
    "avgHitTime": 2.3,
    "avgMissTime": 89.7
  }
}
```

#### POST /cache/clear
Clear all cached data.

**Response:**
```json
{
  "message": "Cache cleared successfully",
  "entriesCleared": 247,
  "timestamp": "2025-09-22T10:00:00.000Z"
}
```

## MCP Tools

### 1. get_current_weather

Get real-time weather conditions for any location worldwide.

**Parameters:**
- `latitude` (required): Latitude coordinate (-90 to 90)
- `longitude` (required): Longitude coordinate (-180 to 180)
- `timezone` (optional): IANA timezone name or "auto" (default: "auto")
- `temperature_unit` (optional): "celsius" or "fahrenheit" (default: "celsius")

**Example Request:**
```bash
curl -X POST http://localhost:3000/mcp/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "get_current_weather",
    "arguments": {
      "latitude": 48.8566,
      "longitude": 2.3522,
      "timezone": "Europe/Paris",
      "temperature_unit": "celsius"
    }
  }'
```

**Example Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"location\": {\n    \"latitude\": 48.8566,\n    \"longitude\": 2.3522,\n    \"timezone\": \"Europe/Paris\",\n    \"elevation\": 56.0\n  },\n  \"current_weather\": {\n    \"temperature\": 22.1,\n    \"wind_speed\": 14.8,\n    \"wind_direction\": 225,\n    \"weather_code\": 1,\n    \"is_day\": true,\n    \"time\": \"2025-09-22T14:00\"\n  }\n}"
    }
  ]
}
```

**Weather Codes:**
- `0`: Clear sky
- `1-3`: Mainly clear to partly cloudy
- `45-48`: Fog and depositing rime fog
- `51-67`: Rain (light to heavy)
- `71-86`: Snow (light to heavy)
- `95-99`: Thunderstorm

### 2. get_weather_forecast

Get multi-day weather forecasts with detailed meteorological data.

**Parameters:**
- `latitude` (required): Latitude coordinate (-90 to 90)
- `longitude` (required): Longitude coordinate (-180 to 180)
- `days` (optional): Number of forecast days (1-7, default: 7)
- `timezone` (optional): IANA timezone name or "auto" (default: "auto")
- `temperature_unit` (optional): "celsius" or "fahrenheit" (default: "celsius")

**Example Request:**
```bash
curl -X POST http://localhost:3000/mcp/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "get_weather_forecast",
    "arguments": {
      "latitude": 40.7128,
      "longitude": -74.0060,
      "days": 5,
      "temperature_unit": "fahrenheit"
    }
  }'
```

**Example Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"location\": {\n    \"latitude\": 40.7128,\n    \"longitude\": -74.0060,\n    \"timezone\": \"America/New_York\",\n    \"elevation\": 51.0\n  },\n  \"forecast_days\": 5,\n  \"daily_forecast\": [\n    {\n      \"date\": \"2025-09-22\",\n      \"weather_code\": 2,\n      \"weather_description\": \"Partly cloudy\",\n      \"temperature\": {\n        \"max\": 75.2,\n        \"min\": 63.5,\n        \"unit\": \"°F\"\n      },\n      \"precipitation\": {\n        \"sum\": 0.1,\n        \"probability_max\": 15,\n        \"hours\": 1,\n        \"unit\": \"mm\"\n      },\n      \"wind\": {\n        \"max_speed\": 12.4,\n        \"max_gusts\": 18.7,\n        \"dominant_direction\": 240,\n        \"unit\": \"km/h\"\n      },\n      \"sun\": {\n        \"sunrise\": \"06:58\",\n        \"sunset\": \"19:05\",\n        \"daylight_duration\": 12.12\n      },\n      \"uv_index\": 6.8\n    }\n  ]\n}"
    }
  ]
}
```

### 3. get_hourly_forecast

Get high-precision hourly weather forecasts for detailed planning.

**Parameters:**
- `latitude` (required): Latitude coordinate (-90 to 90)
- `longitude` (required): Longitude coordinate (-180 to 180)
- `forecast_days` (optional): Number of forecast days (1-16, default: 3)
- `timezone` (optional): IANA timezone name or "auto" (default: "auto")
- `temperature_unit` (optional): "celsius" or "fahrenheit" (default: "celsius")

**Example Request:**
```bash
curl -X POST http://localhost:3000/mcp/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "get_hourly_forecast",
    "arguments": {
      "latitude": 35.6762,
      "longitude": 139.6503,
      "forecast_days": 3,
      "timezone": "Asia/Tokyo"
    }
  }'
```

**Example Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"location\": {\n    \"latitude\": 35.6762,\n    \"longitude\": 139.6503,\n    \"timezone\": \"Asia/Tokyo\",\n    \"elevation\": 44.0\n  },\n  \"hourly_forecast\": {\n    \"time\": [\"2025-09-22T00:00\", \"2025-09-22T01:00\", ...],\n    \"temperature_2m\": [18.5, 18.1, 17.8, ...],\n    \"weather_code\": [1, 1, 2, ...],\n    \"precipitation_probability\": [5, 10, 15, ...],\n    \"wind_speed_10m\": [8.2, 7.8, 9.1, ...]\n  }\n}"
    }
  ]
}
```

### 4. geocode_location

Convert location names to precise geographic coordinates.

**Parameters:**
- `location` (required): Location name to search for (2-100 characters)
- `country` (optional): Country filter for disambiguation (max 50 characters)
- `language` (optional): Language for results (ISO 639-1 code, default: "en")
- `max_results` (optional): Maximum results to return (1-20, default: 5)

**Example Request:**
```bash
curl -X POST http://localhost:3000/mcp/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "geocode_location",
    "arguments": {
      "location": "Paris",
      "country": "France",
      "max_results": 1
    }
  }'
```

**Example Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"query\": {\n    \"location\": \"Paris\",\n    \"country\": \"France\",\n    \"language\": \"en\",\n    \"max_results\": 1\n  },\n  \"results\": [\n    {\n      \"name\": \"Paris\",\n      \"full_name\": \"Paris, Île-de-France, France\",\n      \"latitude\": 48.8566,\n      \"longitude\": 2.3522,\n      \"country\": \"France\",\n      \"country_code\": \"FR\",\n      \"admin_regions\": {\n        \"admin1\": \"Île-de-France\"\n      },\n      \"timezone\": \"Europe/Paris\",\n      \"population\": 2161000,\n      \"elevation\": 35,\n      \"feature_type\": \"city\"\n    }\n  ],\n  \"total_found\": 1,\n  \"best_match\": {\n    \"name\": \"Paris\",\n    \"latitude\": 48.8566,\n    \"longitude\": 2.3522\n  }\n}"
    }
  ]
}
```

## Error Handling

### Error Types

1. **Validation Errors (400)**
   - Invalid coordinates (outside valid ranges)
   - Missing required parameters
   - Invalid parameter types or values

2. **API Errors (502)**
   - OpenMeteo API unavailable
   - Network connection issues
   - Upstream service errors

3. **Server Errors (500)**
   - Internal server errors
   - Unexpected exceptions
   - Configuration issues

4. **Not Found (404)**
   - Invalid endpoints
   - Unknown tool names

5. **Timeout (408)**
   - Request processing timeout
   - Long-running operations

### Error Response Structure

```json
{
  "error": {
    "code": 400,
    "message": "Invalid latitude: must be between -90 and 90",
    "data": {
      "type": "validation_error",
      "timestamp": "2025-09-22T10:00:00.000Z",
      "correlationId": "abc123",
      "field": "latitude",
      "value": 95.5,
      "constraint": "range",
      "recommendation": "Use latitude between -90 and 90 degrees"
    }
  }
}
```

### Common Error Scenarios

**Invalid Coordinates:**
```json
{
  "error": {
    "code": 400,
    "message": "Invalid coordinates: latitude 95.5 must be between -90 and 90",
    "data": {
      "type": "validation_error",
      "recommendation": "Check coordinate ranges: lat (-90 to 90), lng (-180 to 180)"
    }
  }
}
```

**Missing Parameters:**
```json
{
  "error": {
    "code": 400,
    "message": "Missing required parameter: latitude",
    "data": {
      "type": "validation_error",
      "required": ["latitude", "longitude"],
      "provided": ["longitude"]
    }
  }
}
```

**API Unavailable:**
```json
{
  "error": {
    "code": 502,
    "message": "Weather service temporarily unavailable",
    "data": {
      "type": "api_error",
      "recommendation": "Retry in a few moments or check service status"
    }
  }
}
```

## Code Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');

async function getCurrentWeather(lat, lng) {
  try {
    const response = await axios.post('http://localhost:3000/mcp/call', {
      name: 'get_current_weather',
      arguments: {
        latitude: lat,
        longitude: lng,
        temperature_unit: 'celsius'
      }
    });

    const weatherData = JSON.parse(response.data.content[0].text);
    return weatherData;
  } catch (error) {
    console.error('Weather API Error:', error.response?.data || error.message);
    throw error;
  }
}

// Usage
getCurrentWeather(48.8566, 2.3522)
  .then(weather => console.log('Current weather:', weather))
  .catch(error => console.error('Error:', error));
```

### Python

```python
import requests
import json

def get_weather_forecast(lat, lng, days=5):
    """Get weather forecast for a location."""
    url = "http://localhost:3000/mcp/call"
    payload = {
        "name": "get_weather_forecast",
        "arguments": {
            "latitude": lat,
            "longitude": lng,
            "days": days,
            "temperature_unit": "celsius"
        }
    }

    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()

        data = response.json()
        weather_data = json.loads(data["content"][0]["text"])
        return weather_data
    except requests.exceptions.RequestException as e:
        print(f"API Error: {e}")
        raise

# Usage
try:
    forecast = get_weather_forecast(40.7128, -74.0060, days=3)
    print("Weather forecast:", json.dumps(forecast, indent=2))
except Exception as e:
    print(f"Error: {e}")
```

### cURL Examples

**Get current weather:**
```bash
curl -X POST http://localhost:3000/mcp/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "get_current_weather",
    "arguments": {
      "latitude": 48.8566,
      "longitude": 2.3522
    }
  }' | jq '.content[0].text | fromjson'
```

**Get hourly forecast:**
```bash
curl -X POST http://localhost:3000/mcp/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "get_hourly_forecast",
    "arguments": {
      "latitude": 35.6762,
      "longitude": 139.6503,
      "forecast_days": 2
    }
  }' | jq '.content[0].text | fromjson'
```

**Geocode location:**
```bash
curl -X POST http://localhost:3000/mcp/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "geocode_location",
    "arguments": {
      "location": "Tokyo",
      "max_results": 3
    }
  }' | jq '.content[0].text | fromjson'
```

## Rate Limiting

Currently, rate limiting is not implemented at the application level. It is designed to be handled by:

- **Reverse Proxy**: Nginx, Apache, or cloud load balancer
- **API Gateway**: AWS API Gateway, Google Cloud Endpoints
- **CDN**: Cloudflare, CloudFront with rate limiting rules

**Future Implementation:**
- Per-IP rate limiting
- API key based quotas
- Burst protection
- Rate limit headers in responses

## Caching

The server implements intelligent caching to optimize performance and reduce API calls.

### Cache Strategy

| Data Type | TTL | Cache Key Format |
|-----------|-----|------------------|
| Current Weather | 10 minutes | `current:${lat}:${lng}:${unit}` |
| Daily Forecast | 60 minutes | `forecast:${lat}:${lng}:${days}:${unit}` |
| Hourly Forecast | 30 minutes | `hourly:${lat}:${lng}:${days}:${unit}` |
| Geocoding | 2 hours | `geocode:${location}:${country}:${lang}` |

### Cache Headers

Responses include cache information:

```
X-Cache: HIT|MISS
X-Cache-Key: current:48.8566:2.3522:celsius
X-Response-Time: 3ms
```

### Performance Impact

- **Cache Hit**: ~3ms response time
- **Cache Miss**: ~60-100ms response time
- **Hit Rate**: Typically 70-85% in production
- **Memory Usage**: ~50MB for 1000 cached entries

### Cache Management

**Check cache statistics:**
```bash
curl http://localhost:3000/cache/stats | jq
```

**Clear cache:**
```bash
curl -X POST http://localhost:3000/cache/clear
```

## Testing

### Health Check
```bash
curl http://localhost:3000/health
```

### Tool Availability
```bash
curl http://localhost:3000/mcp/tools | jq '.tools[].name'
```

### Complete Test Suite
```bash
npm run test:comprehensive
```

## Support

- **Documentation**: Complete guides in `src/docs/`
- **Examples**: Ready-to-run examples in `src/docs/examples/`
- **Troubleshooting**: Common issues and solutions in `src/docs/troubleshooting.md`
- **Health Monitoring**: Real-time status at `/health`, `/ready`, `/live`

---

*Generated on 2025-09-22 - MCP Weather Server v1.0.0*