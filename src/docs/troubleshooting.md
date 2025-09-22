# Troubleshooting Guide

## 🔧 Common Issues and Solutions

### Server Startup Issues

#### Port Already in Use
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solution:**
```bash
# Find process using port 3000
lsof -ti:3000

# Kill the process
kill -9 $(lsof -ti:3000)

# Or use a different port
PORT=3001 npm run dev
```

#### TypeScript Compilation Errors
```
Error: Cannot find module './types.js'
```

**Solution:**
```bash
# Clean and rebuild
npm run clean
npm run build

# Check TypeScript configuration
npx tsc --noEmit
```

### API Request Issues

#### Invalid Coordinates Error
```json
{
  "error": {
    "code": 400,
    "message": "Latitude must be between -90 and 90 degrees"
  }
}
```

**Solution:**
- Ensure latitude is between -90 and 90
- Ensure longitude is between -180 and 180
- Use decimal degrees format (not DMS)

**Examples:**
```bash
# ✅ Correct
curl -X POST http://localhost:3000/mcp/call \
  -d '{"name": "get_current_weather", "arguments": {"latitude": 48.8566, "longitude": 2.3522}}'

# ❌ Incorrect
curl -X POST http://localhost:3000/mcp/call \
  -d '{"name": "get_current_weather", "arguments": {"latitude": 91, "longitude": 200}}'
```

#### Tool Not Found Error
```json
{
  "error": {
    "code": 400,
    "message": "Unknown tool: invalid_tool_name"
  }
}
```

**Solution:**
Check available tools:
```bash
curl http://localhost:3000/mcp/tools | jq '.tools[].name'
```

Available tools:
- `get_current_weather`
- `get_weather_forecast`
- `get_hourly_forecast`
- `geocode_location`

#### Geocoding No Results
```json
{
  "results": [],
  "generationTime": 0.023
}
```

**Solutions:**
1. Try simpler location names
2. Add country filter
3. Check spelling
4. Use alternative names

```bash
# Instead of "Saint-Germain-des-Prés"
curl -X POST http://localhost:3000/mcp/call \
  -d '{"name": "geocode_location", "arguments": {"location": "Paris", "country": "France"}}'
```

### Performance Issues

#### Slow Response Times
Response time > 1000ms consistently

**Diagnosis:**
```bash
# Check cache statistics
curl http://localhost:3000/cache/stats | jq '{hitRate: .hitRate, entries: .entries}'

# Monitor individual requests
curl -w "Time: %{time_total}s\n" -X POST http://localhost:3000/mcp/call \
  -d '{"name": "get_current_weather", "arguments": {"latitude": 48.8566, "longitude": 2.3522}}'
```

**Solutions:**
1. **Low cache hit rate (<50%)**:
   ```bash
   # Check cache configuration
   curl http://localhost:3000/cache/stats | jq '.configs'

   # Clear cache if corrupted
   curl -X POST http://localhost:3000/cache/clear
   ```

2. **Network issues**:
   ```bash
   # Test Open-Meteo API directly
   curl "https://api.open-meteo.com/v1/forecast?latitude=48.8566&longitude=2.3522&current_weather=true"
   ```

3. **High memory usage**:
   ```bash
   # Check cache memory usage
   curl http://localhost:3000/cache/stats | jq '.memoryUsage'

   # Clear cache if >100MB
   curl -X POST http://localhost:3000/cache/clear
   ```

#### Memory Leaks
Server memory usage continuously increasing

**Diagnosis:**
```bash
# Monitor memory usage
while true; do
  echo "$(date): $(curl -s http://localhost:3000/cache/stats | jq '.memoryUsage') bytes"
  sleep 60
done
```

**Solutions:**
1. **Restart server periodically**:
   ```bash
   # In production, use process manager
   pm2 start dist/index.js --name weather-server --max-memory-restart 500M
   ```

2. **Clear cache regularly**:
   ```bash
   # Setup cron job to clear cache daily
   echo "0 2 * * * curl -X POST http://localhost:3000/cache/clear" | crontab -
   ```

### API Error Responses

#### Open-Meteo API Errors
```json
{
  "error": {
    "code": 502,
    "message": "API request failed",
    "data": {
      "type": "API_ERROR"
    }
  }
}
```

**Solutions:**
1. **Check API status**:
   ```bash
   curl -I "https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0&current_weather=true"
   ```

2. **Verify coordinates**:
   ```bash
   # Test with known good coordinates
   curl -X POST http://localhost:3000/mcp/call \
     -d '{"name": "get_current_weather", "arguments": {"latitude": 0, "longitude": 0}}'
   ```

3. **Rate limiting**:
   - Open-Meteo has rate limits
   - Cache helps reduce API calls
   - Implement request spacing if needed

#### Network Timeout Errors
```json
{
  "error": {
    "code": 503,
    "message": "Request timeout",
    "data": {
      "type": "NETWORK_ERROR"
    }
  }
}
```

**Solutions:**
1. **Check internet connection**:
   ```bash
   ping api.open-meteo.com
   ```

2. **Increase timeout** (in development):
   ```javascript
   // In optimizedWeatherService.ts
   timeout: 10000 // 10 seconds
   ```

3. **Use cached data**:
   ```bash
   # Check if data is in cache
   curl http://localhost:3000/cache/stats | jq '.typeBreakdown'
   ```

### Logging and Debugging

#### Enable Debug Logging
```bash
LOG_LEVEL=DEBUG npm run dev
```

#### View Structured Logs
```bash
# Follow logs in real-time
npm run dev | jq '.'

# Filter by log level
npm run dev | grep ERROR

# Filter by operation
npm run dev | grep "tool_call"
```

#### Correlation ID Tracking
Each request gets a unique correlation ID for tracking:

```bash
# Look for correlation ID in logs
npm run dev | grep "abc123de"
```

### Cache Issues

#### Cache Not Working
Cache always shows MISS

**Diagnosis:**
```bash
# Test cache with identical requests
curl -X POST http://localhost:3000/mcp/call \
  -d '{"name": "get_current_weather", "arguments": {"latitude": 48.8566, "longitude": 2.3522}}' \
  -H "Content-Type: application/json"

# Check response headers
curl -I -X POST http://localhost:3000/mcp/call \
  -d '{"name": "get_current_weather", "arguments": {"latitude": 48.8566, "longitude": 2.3522}}' \
  -H "Content-Type: application/json"
```

**Solutions:**
1. **Check cache key generation**:
   - Ensure identical parameters
   - Check coordinate precision
   - Verify parameter order doesn't matter

2. **Cache TTL expired**:
   ```bash
   # Check cache configuration
   curl http://localhost:3000/cache/stats | jq '.configs'
   ```

3. **Clear corrupted cache**:
   ```bash
   curl -X POST http://localhost:3000/cache/clear
   ```

#### Cache Taking Too Much Memory
```bash
# Check memory usage
curl http://localhost:3000/cache/stats | jq '.memoryUsage'
```

**Solutions:**
1. **Reduce cache size limits**:
   - Edit `src/utils/cache.ts`
   - Reduce `maxSize` values

2. **Shorter TTL**:
   - Reduce cache TTL values
   - More frequent cleanup

3. **Clear specific cache types**:
   ```bash
   # Would need custom endpoint for type-specific clearing
   curl -X POST http://localhost:3000/cache/clear
   ```

### Integration Issues

#### Claude Desktop Integration
MCP server not appearing in Claude Desktop

**Solutions:**
1. **Check MCP configuration**:
   ```json
   {
     "mcpServers": {
       "weather": {
         "command": "node",
         "args": ["/full/path/to/dist/index.js"],
         "env": {
           "PORT": "3000"
         }
       }
     }
   }
   ```

2. **Verify server is running**:
   ```bash
   curl http://localhost:3000/health
   ```

3. **Check Claude Desktop logs**:
   - Look for connection errors
   - Verify port is accessible

#### CORS Issues
Browser requests failing due to CORS

**Solutions:**
1. **Configure CORS origin**:
   ```bash
   CORS_ORIGIN="http://localhost:3001" npm run dev
   ```

2. **Check CORS headers**:
   ```bash
   curl -H "Origin: http://localhost:3001" \
        -H "Access-Control-Request-Method: POST" \
        -H "Access-Control-Request-Headers: Content-Type" \
        -X OPTIONS \
        http://localhost:3000/mcp/call
   ```

### Environment Issues

#### Development vs Production
Different behavior between environments

**Check environment variables**:
```bash
echo $NODE_ENV
echo $PORT
echo $CORS_ORIGIN
echo $LOG_LEVEL
```

**Production configuration**:
```bash
NODE_ENV=production npm start
```

#### Dependencies Issues
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Check for vulnerabilities
npm audit

# Update dependencies
npm update
```

## 🔍 Advanced Debugging

### Network Analysis
```bash
# Monitor all HTTP requests
sudo netstat -tulpn | grep :3000

# Check DNS resolution
nslookup api.open-meteo.com

# Test with different DNS
dig api.open-meteo.com @8.8.8.8
```

### Performance Profiling
```bash
# Run performance tests
npm run test:performance

# Monitor system resources
top -p $(pgrep -f "node.*index.js")

# Check disk usage
df -h
```

### Log Analysis
```bash
# Count requests by tool
npm run dev | grep "Tool called" | cut -d: -f2 | sort | uniq -c

# Average response times
npm run dev | grep "Response time" | awk '{print $NF}' | sed 's/ms//' | awk '{sum+=$1; count++} END {print sum/count "ms"}'

# Error rate analysis
npm run dev | grep ERROR | wc -l
```

## 📞 Getting Help

1. **Check server logs** with correlation IDs
2. **Test with minimal examples** from `curl-examples.sh`
3. **Verify cache statistics** and clear if needed
4. **Monitor performance** with built-in metrics
5. **Review API documentation** for correct usage

## 🚨 Emergency Procedures

### Server Unresponsive
```bash
# Force restart
pkill -f "node.*weather"
npm run dev

# Check system resources
free -m
df -h
```

### Data Corruption
```bash
# Clear all caches
curl -X POST http://localhost:3000/cache/clear

# Restart with clean state
npm run clean
npm run build
npm start
```

### High Error Rate
```bash
# Check error types
curl http://localhost:3000/cache/stats | jq '.errorCounts'

# Verify API connectivity
curl -I "https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0&current_weather=true"

# Restart server
npm restart
```