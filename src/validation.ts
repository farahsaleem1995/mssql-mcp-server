import { z } from 'zod';

/**
 * Keywords that indicate a destructive or unauthorized SQL operation.
 * Checked as whole-word boundaries to reduce false positives.
 */
const DESTRUCTIVE_KEYWORDS = [
  'DROP',
  'DELETE',
  'INSERT',
  'UPDATE',
  'ALTER',
  'CREATE',
  'TRUNCATE',
  'EXEC',
  'EXECUTE',
  'MERGE',
  'GRANT',
  'REVOKE',
  'DENY',
];

/** Patterns that indicate stored procedure calls */
const DANGEROUS_PATTERNS = [/\bsp_/i, /\bxp_/i];

/**
 * Builds a regex that matches any of the destructive keywords as whole words.
 */
function containsDestructiveKeyword(sql: string): boolean {
  const pattern = new RegExp(`\\b(${DESTRUCTIVE_KEYWORDS.join('|')})\\b`, 'i');
  if (pattern.test(sql)) return true;
  return DANGEROUS_PATTERNS.some((p) => p.test(sql));
}

/**
 * Zod schema for read-only SQL queries.
 * Ensures the query starts with SELECT and contains no destructive keywords.
 */
export const ReadOnlySqlSchema = z
  .string()
  .min(1, 'SQL query cannot be empty')
  .refine((sql) => sql.trimStart().toUpperCase().startsWith('SELECT'), {
    message: 'Query must start with SELECT',
  })
  .refine((sql) => !containsDestructiveKeyword(sql), {
    message:
      'Query contains forbidden keywords (DROP, DELETE, INSERT, UPDATE, ALTER, CREATE, TRUNCATE, EXEC, MERGE, GRANT, REVOKE, DENY)',
  });

/**
 * Zod schema for table names.
 * Allows schema-qualified names like [dbo].[Users] or dbo.Users.
 */
export const TableNameSchema = z
  .string()
  .min(1, 'Table name cannot be empty')
  .regex(/^[\w.\[\]]+$/, 'Invalid table name format — only alphanumerics, underscores, dots, and brackets allowed');
