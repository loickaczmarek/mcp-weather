# 🌤️ MCP Weather Server - Production Dockerfile
# Multi-stage build for optimized production image

# =============================================================================
# 🔨 Build Stage
# =============================================================================
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci --include=dev

# Copy source code
COPY . .

# Build the application
RUN npm run build:prod

# Remove dev dependencies to reduce image size
RUN npm ci --omit=dev && npm cache clean --force

# =============================================================================
# 🚀 Production Stage
# =============================================================================
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init curl jq

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcpweather -u 1001

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=mcpweather:nodejs /app/dist ./dist
COPY --from=builder --chown=mcpweather:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=mcpweather:nodejs /app/package*.json ./

# Set environment variables for production
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Health check configuration
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:$PORT/health || exit 1

# Switch to non-root user
USER mcpweather

# Expose port
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]

# =============================================================================
# 📊 Image Metadata
# =============================================================================
LABEL org.opencontainers.image.title="MCP Weather Server"
LABEL org.opencontainers.image.description="High-performance TypeScript HTTP server implementing MCP for weather data"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.vendor="MCP Weather Server"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.source="https://github.com/your-repo/mcp-weather-server"