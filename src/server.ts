import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools.js';

/**
 * Creates and configures a new McpServer instance with all tools registered.
 * Uses a factory function so each Streamable HTTP session can get its own instance.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: 'sqlserver-mcp',
    version: '1.0.0',
  });

  registerTools(server);

  return server;
}
