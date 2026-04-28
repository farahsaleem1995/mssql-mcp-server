import sql from 'mssql';

let poolPromise: Promise<sql.ConnectionPool> | null = null;

function createConfig(): sql.config {
  const config: sql.config = {
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_DATABASE || 'master',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    pool: {
      max: 20,
      min: 0,
      idleTimeoutMillis: 30_000,
    },
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    },
  };

  // Only set port for default instances; named instances use SQL Browser for port resolution
  if (process.env.DB_PORT) {
    config.port = parseInt(process.env.DB_PORT, 10);
  }

  return config;
}

/**
 * Returns a singleton connection pool, creating it lazily on first call.
 */
export function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    const config = createConfig();
    poolPromise = new sql.ConnectionPool(config)
      .connect()
      .then((pool: sql.ConnectionPool) => {
        console.log('[db] Connected to SQL Server');
        pool.on('error', (err: Error) => {
          console.error('[db] Pool error:', err);
        });
        return pool;
      })
      .catch((err: Error) => {
        console.error('[db] Connection failed:', err.message);
        poolPromise = null; // Allow retry on next call
        throw err;
      });
  }
  return poolPromise!;
}

/**
 * Closes the connection pool gracefully.
 */
export async function closePool(): Promise<void> {
  if (poolPromise) {
    try {
      const pool = await poolPromise;
      await pool.close();
      console.log('[db] Pool closed');
    } catch {
      // Pool may already be closed or never connected
    } finally {
      poolPromise = null;
    }
  }
}
