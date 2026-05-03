import dotenv from 'dotenv';
import { resolve } from 'node:path';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createServer } from './server.js';
import { closePool } from './db.js';

// ─── Load environment from CLI arg or default .env ─────────────────────────
const envFileArg = process.argv.indexOf('--env-file');
const envPath = envFileArg !== -1 && process.argv[envFileArg + 1]
  ? resolve(process.argv[envFileArg + 1])
  : undefined;

dotenv.config({ path: envPath });

const PORT = parseInt(process.env.MCP_PORT || '3001', 10);
const app = express();

app.use(express.json());

// ─── CORS ───────────────────────────────────────────────────────────────────
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id');
  res.header('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  next();
});

// ─── Health Check ───────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', server: 'sqlserver-mcp', version: '1.0.0' });
});

// ═══════════════════════════════════════════════════════════════════════════
// SSE TRANSPORT (Legacy — GET /sse + POST /messages)
// ═══════════════════════════════════════════════════════════════════════════

const sseTransports: Record<string, SSEServerTransport> = {};

app.get('/sse', async (req, res) => {
  console.log('[sse] New SSE connection');

  const server = createServer();
  const transport = new SSEServerTransport('/messages', res);
  sseTransports[transport.sessionId] = transport;

  res.on('close', () => {
    console.log(`[sse] Connection closed: ${transport.sessionId}`);
    delete sseTransports[transport.sessionId];
  });

  await server.connect(transport);
});

app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = sseTransports[sessionId];

  if (!transport) {
    res.status(404).json({ error: 'SSE session not found. Connect to GET /sse first.' });
    return;
  }

  await transport.handlePostMessage(req, res, req.body);
});

// ═══════════════════════════════════════════════════════════════════════════
// STREAMABLE HTTP TRANSPORT (Modern — POST /mcp + GET /mcp)
// ═══════════════════════════════════════════════════════════════════════════

const streamTransports: Record<string, StreamableHTTPServerTransport> = {};

app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  // New session — initialize
  if (!sessionId && isInitializeRequest(req.body)) {
    const newSessionId = randomUUID();
    console.log(`[mcp] New Streamable HTTP session: ${newSessionId}`);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
    });

    transport.onclose = () => {
      console.log(`[mcp] Session closed: ${newSessionId}`);
      delete streamTransports[newSessionId];
    };

    streamTransports[newSessionId] = transport;

    const server = createServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    return;
  }

  // Existing session
  if (sessionId && streamTransports[sessionId]) {
    await streamTransports[sessionId].handleRequest(req, res, req.body);
    return;
  }

  res.status(400).json({
    error: 'Invalid or missing session. Send an initialize request without Mcp-Session-Id to start.',
  });
});

// Optional: GET /mcp for server-initiated SSE notifications
app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId && streamTransports[sessionId]) {
    await streamTransports[sessionId].handleRequest(req, res);
    return;
  }

  res.status(400).json({ error: 'Invalid or missing Mcp-Session-Id header.' });
});

// ─── Graceful Shutdown ──────────────────────────────────────────────────────

async function shutdown() {
  console.log('\n[server] Shutting down...');

  // Close all SSE transports
  for (const [id, transport] of Object.entries(sseTransports)) {
    try {
      await transport.close?.();
    } catch { /* ignore */ }
    delete sseTransports[id];
  }

  // Close all Streamable HTTP transports
  for (const [id, transport] of Object.entries(streamTransports)) {
    try {
      await transport.close?.();
    } catch { /* ignore */ }
    delete streamTransports[id];
  }

  await closePool();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ─── Start ──────────────────────────────────────────────────────────────────

const DB_NAME = process.env.DB_DATABASE || 'unknown';
const ENV_LABEL = envPath || '.env';

app.listen(PORT, () => {
  console.log(`
┌──────────────────────────────────────────────────┐
│  SQL Server MCP Server                           │
│                                                  │
│  Database:    ${DB_NAME.padEnd(35)}│
│  Env file:    ${ENV_LABEL.padEnd(35)}│
│                                                  │
│  SSE:         http://localhost:${PORT}/sse${' '.repeat(Math.max(0, 14 - String(PORT).length))}│
│  Streamable:  http://localhost:${PORT}/mcp${' '.repeat(Math.max(0, 14 - String(PORT).length))}│
│  Health:      http://localhost:${PORT}/health${' '.repeat(Math.max(0, 11 - String(PORT).length))}│
│                                                  │
│  Ready to accept connections                     │
└──────────────────────────────────────────────────┘
  `);
});
