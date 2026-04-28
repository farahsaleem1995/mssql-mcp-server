import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getPool } from './db.js';
import { ReadOnlySqlSchema, TableNameSchema } from './validation.js';

/** Maximum rows returned by execute_read to prevent oversized responses. */
const MAX_ROWS = 1000;

/**
 * Helper to build a successful MCP tool response.
 */
function success(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Helper to build an error MCP tool response.
 */
function error(message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  };
}

/**
 * Registers all SQL Server tools on the given McpServer instance.
 */
export function registerTools(server: McpServer): void {
  // ─── list_tables ──────────────────────────────────────────────────────────
  server.registerTool(
    'list_tables',
    {
      title: 'List Tables',
      description: 'Lists all tables and views in the database with their schema and type',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const pool = await getPool();
        const result = await pool.request().query(`
          SELECT
            TABLE_SCHEMA  AS [schema],
            TABLE_NAME    AS [name],
            TABLE_TYPE    AS [type]
          FROM INFORMATION_SCHEMA.TABLES
          ORDER BY TABLE_SCHEMA, TABLE_NAME
        `);
        return success(result.recordset);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return error(`Failed to list tables: ${message}`);
      }
    },
  );

  // ─── get_schema ───────────────────────────────────────────────────────────
  server.registerTool(
    'get_schema',
    {
      title: 'Get Table Schema',
      description: 'Returns the column definitions (name, type, length, nullable, default) for a specific table',
      inputSchema: {
        tableName: z.string().describe('The name of the table to inspect (e.g. "Users" or "dbo.Users")'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ tableName }) => {
      // Validate table name format
      const parsed = TableNameSchema.safeParse(tableName);
      if (!parsed.success) {
        return error(parsed.error.errors.map((e) => e.message).join('; '));
      }

      try {
        const pool = await getPool();

        // Split schema-qualified name if provided (e.g. "dbo.Users")
        let schemaFilter = '';
        let tableFilter = parsed.data;

        const dotIndex = parsed.data.replace(/\[/g, '').replace(/\]/g, '').indexOf('.');
        if (dotIndex > 0) {
          const clean = parsed.data.replace(/\[/g, '').replace(/\]/g, '');
          schemaFilter = clean.substring(0, dotIndex);
          tableFilter = clean.substring(dotIndex + 1);
        }

        const request = pool.request().input('tableName', tableFilter);
        let query = `
          SELECT
            COLUMN_NAME               AS [column],
            DATA_TYPE                 AS [dataType],
            CHARACTER_MAXIMUM_LENGTH  AS [maxLength],
            IS_NULLABLE               AS [nullable],
            COLUMN_DEFAULT            AS [default]
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = @tableName
        `;

        if (schemaFilter) {
          request.input('schemaName', schemaFilter);
          query += ` AND TABLE_SCHEMA = @schemaName`;
        }

        query += ` ORDER BY ORDINAL_POSITION`;

        const result = await request.query(query);

        if (result.recordset.length === 0) {
          return error(`Table "${tableName}" not found or has no columns`);
        }

        return success(result.recordset);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return error(`Failed to get schema for "${tableName}": ${message}`);
      }
    },
  );

  // ─── execute_read ─────────────────────────────────────────────────────────
  server.registerTool(
    'execute_read',
    {
      title: 'Execute Read Query',
      description: `Executes a read-only SQL SELECT query and returns results (max ${MAX_ROWS} rows). The query MUST start with SELECT and must not contain destructive keywords.`,
      inputSchema: {
        sql: z.string().describe('The SELECT query to execute'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ sql: rawSql }) => {
      // Validate the SQL is read-only
      const parsed = ReadOnlySqlSchema.safeParse(rawSql);
      if (!parsed.success) {
        return error(parsed.error.errors.map((e) => e.message).join('; '));
      }

      try {
        const pool = await getPool();

        // Wrap in a TOP constraint if not already present to enforce row limit
        let safeSql = parsed.data;
        const upperSql = safeSql.trimStart().toUpperCase();
        if (!upperSql.match(/^SELECT\s+TOP\s/)) {
          safeSql = safeSql.replace(/^(\s*SELECT\s)/i, `$1TOP ${MAX_ROWS} `);
        }

        const result = await pool.request().query(safeSql);

        return success({
          rowCount: result.recordset.length,
          rows: result.recordset,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return error(`Query execution failed: ${message}`);
      }
    },
  );
}
