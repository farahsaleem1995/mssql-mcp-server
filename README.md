# SQL Server MCP Server

A production-grade [Model Context Protocol](https://modelcontextprotocol.io/) server that provides **read-only** access to a Microsoft SQL Server database. Built with Node.js, TypeScript, Express, and the official MCP SDK.

## Features

- **Dual Transport** — Supports both legacy SSE (`GET /sse` + `POST /messages`) and modern Streamable HTTP (`POST /mcp`) transports
- **Read-Only Safety** — Zod validation ensures only `SELECT` queries are executed; destructive keywords are blocked at the application layer
- **Row Limit** — `execute_read` automatically enforces a `TOP 1000` row limit to prevent oversized responses
- **Connection Pooling** — Singleton `mssql` connection pool with lazy initialization and graceful shutdown
- **Structured Errors** — Every tool returns clean JSON; errors include `isError: true` for the MCP host to handle

## Available Tools

| Tool | Description |
|---|---|
| `list_tables` | Lists all tables and views from `INFORMATION_SCHEMA.TABLES` |
| `get_schema` | Returns column definitions for a given table (supports schema-qualified names like `dbo.Users`) |
| `execute_read` | Executes a read-only `SELECT` query and returns up to 1000 rows |

## Quick Start

### 1. Install Dependencies

```bash
cd mssql-mcp-server
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your SQL Server credentials:

```env
DB_SERVER=localhost
DB_PORT=1433
DB_DATABASE=MyDatabase
DB_USER=mcp_readonly
DB_PASSWORD=YourSecurePassword
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
MCP_PORT=3001
```

### 3. Start the Server

```bash
# Development (hot-reload)
npm run dev

# Production
npm run build
npm start
```

### 4. Verify

```bash
# Health check
curl http://localhost:3001/health

# Connect with MCP Inspector
npx @modelcontextprotocol/inspector http://localhost:3001/sse
```

## Connecting from ASP.NET Core

Use the `ModelContextProtocol` NuGet package:

```csharp
using ModelContextProtocol.Client;
using ModelContextProtocol.Transport.Http;

var transport = new SseClientTransport(new SseClientTransportOptions
{
    Endpoint = new Uri("http://localhost:3001/sse")
});

var client = await McpClientFactory.CreateAsync(clientTransport: transport);

// List available tools
var tools = await client.ListToolsAsync();

// Call a tool
var result = await client.CallToolAsync("list_tables");
```

## Endpoints

| Method | Path | Transport | Description |
|---|---|---|---|
| `GET` | `/sse` | SSE | Establish SSE connection |
| `POST` | `/messages?sessionId=...` | SSE | Send JSON-RPC messages |
| `POST` | `/mcp` | Streamable HTTP | Initialize or send requests |
| `GET` | `/mcp` | Streamable HTTP | Server-initiated notifications |
| `GET` | `/health` | — | Health check |

## IDE Integration

### Antigravity (Gemini)

Edit `~/.gemini/antigravity/mcp_config.json` (or use **Agent Manager → Manage MCP Servers → View raw config**):

```json
{
  "mcpServers": {
    "sqlserver": {
      "url": "http://localhost:3001/sse"
    }
  }
}
```

### VS Code / GitHub Copilot

Create `.vscode/mcp.json` in your project root (or use **Cmd/Ctrl+Shift+P → MCP: Add Server**):

```json
{
  "servers": {
    "sqlserver": {
      "type": "sse",
      "url": "http://localhost:3001/sse"
    }
  }
}
```

### Cursor

Open **Settings → MCP → Add new MCP server**, or edit `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "sqlserver": {
      "url": "http://localhost:3001/sse"
    }
  }
}
```

> **Note:** Make sure the MCP server is running (`npm run dev`) before connecting from your IDE. All three editors support SSE transport. For Streamable HTTP, use `http://localhost:3001/mcp` if your client supports it.

## Setting Up a Read-Only SQL Server User

For production, **never use `sa` or a full-privilege account**. Create a dedicated read-only user:

```sql
-- Connect as sysadmin and run against your target database:

-- 1. Create a login (server-level)
CREATE LOGIN mcp_readonly
WITH PASSWORD = 'YourSecurePassword!',
     CHECK_POLICY = ON;

-- 2. Create a user mapped to the login (database-level)
USE [YourDatabase];
CREATE USER mcp_readonly FOR LOGIN mcp_readonly;

-- 3. Grant read-only access
ALTER ROLE db_datareader ADD MEMBER mcp_readonly;

-- 4. (Optional) Grant access to view definitions (helpful for schema inspection)
GRANT VIEW DEFINITION TO mcp_readonly;
```

### Verifying Permissions

```sql
-- Should succeed:
SELECT TOP 1 * FROM YourTable;

-- Should fail:
INSERT INTO YourTable (col) VALUES ('test');
-- Error: The INSERT permission was denied
```

> **Note:** The MCP server also validates queries at the application layer (must start with `SELECT`, no destructive keywords). The read-only DB user is an additional defense-in-depth layer.

## Project Structure

```
mssql-mcp-server/
├── src/
│   ├── index.ts          # Express app + transport wiring
│   ├── server.ts         # McpServer factory + tool registration
│   ├── db.ts             # Singleton connection pool
│   ├── tools.ts          # Tool definitions (list_tables, get_schema, execute_read)
│   └── validation.ts     # Zod schemas + SQL safety refinements
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## License

MIT
