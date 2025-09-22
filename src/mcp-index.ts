#!/usr/bin/env node

/**
 * Point d'entrée pour le serveur MCP Weather HTTP
 */

import { MCPHTTPServer } from './mcp-server.js';

// For backward compatibility, redirect to HTTP server
const server = new MCPHTTPServer();
server.start();