/**
 * 🌤️ MCP Weather Server - HTTP Entry Point
 *
 * Entry point for the HTTP MCP server compatible with Claude Code.
 * Use this for HTTP transport connections.
 */

import { MCPHTTPServer } from './mcp-server.js';

// Create and start the HTTP MCP server
const server = new MCPHTTPServer();
server.start();

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down HTTP MCP server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down HTTP MCP server...');
  process.exit(0);
});