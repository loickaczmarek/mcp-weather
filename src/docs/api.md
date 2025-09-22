# MCP Weather Server API Documentation

## 🌤️ Overview

The MCP Weather Server is a high-performance HTTP server that provides weather data using the Model Context Protocol (MCP). It integrates with the Open-Meteo API to deliver real-time weather information, forecasts, and geocoding services with intelligent caching and comprehensive error handling.

### Key Features

- 🚀 **High Performance**: Advanced caching system with 94.5% response time improvement
- 🌍 **Global Coverage**: Worldwide weather data with precise coordinate support
- 📊 **Comprehensive Data**: Current weather, multi-day forecasts, and hourly data
- 🔍 **Smart Geocoding**: Multi-language location search with disambiguation
- 🛡️ **Robust Error Handling**: Detailed error responses with recommendations
- 📈 **Performance Monitoring**: Built-in metrics and structured logging
- 🔄 **Intelligent Caching**: TTL-based caching with automatic invalidation

---

## 🚀 Quick Start

### Installation

```bash
git clone <repository-url>
cd poc-mcp-weather
npm install
```

### Running the Server

```bash
# Development mode with hot reload
npm run dev

# Production mode
npm run build
npm start

# Custom port
PORT=8080 npm run dev
```

### Health Check

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-09-19T13:30:00.000Z",
  "version": "1.0.0"
}
```

---

## 📡 API Endpoints

### Base URL
```
http://localhost:3000
```

### Authentication
No authentication required. The server is designed for local or trusted network use.

---

## 🛠️ MCP Tools Endpoints

### 1. List Available Tools

**Endpoint:** `GET /mcp/tools`

Lists all available MCP tools with detailed descriptions and schemas.

#### Example Request

```bash
curl -X GET http://localhost:3000/mcp/tools \
  -H "Content-Type: application/json"
```

#### Example Response

```json
{
  "tools": [
    {
      "name": "get_current_weather",
      "description": "Get real-time weather conditions for any location worldwide...",
      "inputSchema": {
        "type": "object",
        "properties": {
          "latitude": {
            "type": "number",
            "minimum": -90,
            "maximum": 90,
            "description": "Latitude coordinate in decimal degrees...",
            "examples": [48.8566, -33.8688, 64.1466, 0.0]
          }
        }
      }
    }
  ]
}
```

---

### 2. Call MCP Tools

**Endpoint:** `POST /mcp/call`

Executes MCP tools with specified parameters.

#### Request Format

```json
{
  "name": "tool_name",
  "arguments": {
    "parameter1": "value1",
    "parameter2": "value2"
  }
}
```

#### Response Format

```json
{
  "content": [
    {
      "type": "text",
      "text": "JSON formatted response data"
    }
  ]
}
```

#### Response Headers

- `X-Cache`: `HIT` or `MISS` - Cache status
- `X-Response-Time`: Response time in milliseconds
- `X-Cache-Key`: Truncated cache key for debugging
- `Cache-Control`: HTTP caching directives
- `ETag`: Entity tag for cache validation

---

## 🌤️ Weather Tools

### Current Weather

Get real-time weather conditions for any location.

#### Request Example

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

#### Response Example

```json
{
  "content": [
    {
      "type": "text",
      "text": "{
        \"location\": {
          \"latitude\": 48.8566,
          \"longitude\": 2.3522,
          \"timezone\": \"Europe/Paris\",
          \"elevation\": 42
        },
        \"current_weather\": {
          \"temperature\": 22.5,
          \"wind_speed\": 12.8,
          \"wind_direction\": 245,
          \"weather_code\": 3,
          \"is_day\": true,
          \"time\": \"2025-09-19T15:30:00\"
        }
      }"
    }
  ]
}
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `latitude` | number | ✅ | - | Latitude (-90 to 90) |
| `longitude` | number | ✅ | - | Longitude (-180 to 180) |
| `timezone` | string | ❌ | `"auto"` | IANA timezone or "auto" |
| `temperature_unit` | string | ❌ | `"celsius"` | "celsius" or "fahrenheit" |

#### Weather Codes

| Code | Condition |
|------|-----------|
| 0 | Clear sky |
| 1-3 | Mainly clear to partly cloudy |
| 45-48 | Fog and depositing rime fog |
| 51-67 | Rain (light to heavy) |
| 71-86 | Snow (light to heavy) |
| 95-99 | Thunderstorm |

---

### Multi-Day Forecast

Get detailed weather forecasts for 1-7 days.

#### Request Example

```bash
curl -X POST http://localhost:3000/mcp/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "get_weather_forecast",
    "arguments": {
      "latitude": 40.7128,
      "longitude": -74.0060,
      "days": 5,
      "timezone": "America/New_York",
      "temperature_unit": "fahrenheit"
    }
  }'
```

#### Response Example

```json
{
  "content": [
    {
      "type": "text",
      "text": "{
        \"location\": {
          \"latitude\": 40.7128,
          \"longitude\": -74.0060,
          \"timezone\": \"America/New_York\",
          \"elevation\": 10
        },
        \"forecast\": {
          \"daily\": {
            \"time\": [\"2025-09-19\", \"2025-09-20\", \"2025-09-21\"],
            \"temperature_2m_max\": [76.5, 78.2, 72.1],
            \"temperature_2m_min\": [65.3, 67.8, 61.9],
            \"precipitation_sum\": [0.0, 0.2, 1.4],
            \"wind_speed_10m_max\": [8.5, 12.3, 15.7],
            \"weather_code\": [1, 3, 61]
          }
        }
      }"
    }
  ]
}
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `latitude` | number | ✅ | - | Latitude (-90 to 90) |
| `longitude` | number | ✅ | - | Longitude (-180 to 180) |
| `days` | number | ❌ | `7` | Forecast days (1-7) |
| `timezone` | string | ❌ | `"auto"` | IANA timezone |
| `temperature_unit` | string | ❌ | `"celsius"` | Temperature unit |

---

### Hourly Forecast

Get detailed hourly weather forecasts.

#### Request Example

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

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `latitude` | number | ✅ | - | Latitude (-90 to 90) |
| `longitude` | number | ✅ | - | Longitude (-180 to 180) |
| `forecast_days` | number | ❌ | `3` | Forecast days (1-16) |
| `timezone` | string | ❌ | `"auto"` | IANA timezone |
| `temperature_unit` | string | ❌ | `"celsius"` | Temperature unit |

---

### Geocoding

Convert location names to coordinates.

#### Request Example

```bash
curl -X POST http://localhost:3000/mcp/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "geocode_location",
    "arguments": {
      "location": "Paris",
      "country": "France",
      "language": "en",
      "max_results": 5
    }
  }'
```

#### Response Example

```json
{
  "content": [
    {
      "type": "text",
      "text": "{
        \"results\": [
          {
            \"name\": \"Paris\",
            \"latitude\": 48.8566,
            \"longitude\": 2.3522,
            \"country\": \"France\",
            \"admin1\": \"Île-de-France\",
            \"population\": 2161000,
            \"timezone\": \"Europe/Paris\"
          }
        ],
        \"generationTime\": 0.045
      }"
    }
  ]
}
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `location` | string | ✅ | - | Location name to search |
| `country` | string | ❌ | - | Country filter |
| `language` | string | ❌ | `"en"` | Language code (ISO 639-1) |
| `max_results` | number | ❌ | `5` | Max results (1-20) |

---

## 🗄️ Cache Management

### Get Cache Statistics

**Endpoint:** `GET /cache/stats`

Returns detailed cache performance statistics.

#### Request Example

```bash
curl -X GET http://localhost:3000/cache/stats
```

#### Response Example

```json
{
  "hits": 156,
  "misses": 43,
  "entries": 8,
  "memoryUsage": 14234,
  "hitRate": 0.784,
  "avgAccessTime": 0.05,
  "typeBreakdown": {
    "current_weather": 5,
    "forecast": 2,
    "geocoding": 1
  },
  "configs": {
    "current_weather": {
      "ttlMinutes": 10,
      "maxSize": 1000,
      "currentSize": 5
    }
  },
  "timestamp": "2025-09-19T15:30:00.000Z"
}
```

### Clear Cache

**Endpoint:** `POST /cache/clear`

Clears all cached data.

#### Request Example

```bash
curl -X POST http://localhost:3000/cache/clear
```

#### Response Example

```json
{
  "message": "Cache cleared",
  "entriesRemoved": 8,
  "timestamp": "2025-09-19T15:30:00.000Z"
}
```

---

## 🚨 Error Handling

### Error Response Format

```json
{
  "error": {
    "code": 400,
    "message": "User-friendly error message",
    "data": {
      "type": "VALIDATION_ERROR",
      "timestamp": "2025-09-19T15:30:00.000Z",
      "correlationId": "abc123-def456-ghi789"
    }
  }
}
```

### Error Types

| Type | Description | HTTP Code |
|------|-------------|-----------|
| `VALIDATION_ERROR` | Invalid input parameters | 400 |
| `API_ERROR` | Open-Meteo API error | 502 |
| `NETWORK_ERROR` | Connection issues | 503 |
| `RATE_LIMIT_ERROR` | Too many requests | 429 |
| `NOT_FOUND_ERROR` | Resource not found | 404 |
| `INTERNAL_ERROR` | Server error | 500 |

### Common Error Examples

#### Invalid Coordinates

```bash
curl -X POST http://localhost:3000/mcp/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "get_current_weather",
    "arguments": {
      "latitude": 91,
      "longitude": 2.3522
    }
  }'
```

Response:
```json
{
  "error": {
    "code": 400,
    "message": "Latitude must be between -90 and 90 degrees",
    "data": {
      "type": "VALIDATION_ERROR",
      "recommendation": "Check coordinate values and ensure they are within valid ranges"
    }
  }
}
```

---

## 🔧 Integration Guide

### Claude Desktop Integration

Add to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "weather": {
      "command": "node",
      "args": ["/path/to/mcp-weather-server/dist/index.js"],
      "env": {
        "PORT": "3000"
      }
    }
  }
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `CORS_ORIGIN` | `*` | CORS allowed origins |
| `LOG_LEVEL` | `INFO` | Logging level |
| `NODE_ENV` | `development` | Environment mode |

---

## 📊 Performance Optimization

### Caching Strategy

| Data Type | TTL | Max Entries | Use Case |
|-----------|-----|-------------|----------|
| Current Weather | 10 minutes | 1000 | Real-time updates |
| Daily Forecast | 60 minutes | 500 | Planning |
| Hourly Forecast | 30 minutes | 300 | Detailed planning |
| Geocoding | 2 hours | 2000 | Location lookup |

### Performance Tips

1. **Use appropriate forecast horizons**: 1-3 days for high accuracy
2. **Leverage caching**: Identical requests return cached results
3. **Batch geocoding**: Get coordinates once, reuse for multiple weather calls
4. **Monitor cache hit rate**: Aim for >70% hit rate for optimal performance

### Response Time Benchmarks

| Operation | Cold Cache | Warm Cache | Improvement |
|-----------|------------|------------|-------------|
| Current Weather | ~60ms | ~3ms | 95% |
| Daily Forecast | ~100ms | ~4ms | 96% |
| Hourly Forecast | ~150ms | ~5ms | 97% |
| Geocoding | ~80ms | ~2ms | 98% |

---

## 🔍 Debugging

### Enable Debug Logging

```bash
LOG_LEVEL=DEBUG npm run dev
```

### Check Server Logs

The server provides structured logging with correlation IDs:

```
ℹ️ [INFO] 2025-09-19T15:30:00.000Z Incoming request (abc123de)
⚡ [INFO] 2025-09-19T15:30:00.045Z Tool called: get_current_weather (abc123de)
💾 [DEBUG] 2025-09-19T15:30:00.046Z Cache HIT: current_weather:48.8566,2.3522 (abc123de)
```

### Performance Monitoring

Monitor slow requests and cache effectiveness:

```bash
curl http://localhost:3000/cache/stats | jq '.hitRate'
```

### Common Issues

1. **Slow responses**: Check cache hit rate and network connectivity
2. **Invalid coordinates**: Ensure latitude/longitude are within valid ranges
3. **Geocoding failures**: Try simpler location names or add country filters
4. **Memory issues**: Monitor cache size and clear if needed

---

## 📈 Monitoring

### Health Monitoring

```bash
# Basic health check
curl -f http://localhost:3000/health || echo "Server down"

# Performance check
curl -s http://localhost:3000/cache/stats | jq '.hitRate > 0.7'
```

### Log Analysis

Key metrics to monitor:

- Response times > 1000ms
- Error rates by type
- Cache hit rates by endpoint
- Memory usage trends

### Alerting Recommendations

- Cache hit rate < 50%
- Average response time > 500ms
- Error rate > 5%
- Memory usage > 500MB

---

## 🛡️ Security

### Input Validation

- All coordinates validated against geographic bounds
- Location strings sanitized against XSS
- Request size limits enforced
- Parameter type validation

### Rate Limiting

Currently no built-in rate limiting. For production use, consider:

- Reverse proxy with rate limiting
- API gateway integration
- Custom middleware implementation

### Data Privacy

- Coordinates rounded to ~11m precision for caching
- No sensitive data logging
- IP addresses anonymized in logs
- No user data persistence

---

## 🧪 Testing

### Run Test Suite

```bash
# Test all endpoints
npm run test:server

# Test specific functionality
npm run test:forecast
npm run test:geocoding
npm run test:performance
npm run test:errors
```

### Manual Testing Examples

See the `/src/test-*.ts` files for comprehensive testing examples.

---

## 🤝 Contributing

1. Follow TypeScript strict mode requirements
2. Add comprehensive error handling
3. Include performance tests for new features
4. Update documentation for API changes
5. Maintain backward compatibility

---

## 📄 License

MIT License - see LICENSE file for details.

---

## 🆘 Support

For issues, questions, or contributions:

1. Check the troubleshooting section above
2. Review server logs for error details
3. Test with minimal examples
4. Report issues with full error context

---

*Generated for MCP Weather Server v1.0.0*