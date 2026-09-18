import knex from 'knex';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatUtcDateTime } from '../helper/date.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure .env from root directory is loaded even if Knex CLI changes cwd to db/
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const connectionString = (process.env.DB_CONNECTION_STRING || process.env.DATABASE_URL || '').trim();

const getConnectionConfig = () => {
  if (connectionString) {
    return {
      connectionString,
      ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
    };
  }

  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'amrutam_db',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  };
};

export const knexConfig = {
  development: {
    client: 'pg',
    connection: getConnectionConfig(),
    pool: {
      min: Number(process.env.DB_POOL_MIN) || 2,
      max: Number(process.env.DB_POOL_MAX) || 10,
    },
    migrations: {
      directory: path.join(__dirname, 'migrations'),
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: path.join(__dirname, 'seeds'),
    },
  },

  test: {
    client: 'pg',
    connection: getConnectionConfig(),
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      directory: path.join(__dirname, 'migrations'),
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: path.join(__dirname, 'seeds'),
    },
  },

  production: {
    client: 'pg',
    connection: getConnectionConfig(),
    pool: {
      min: Number(process.env.DB_POOL_MIN) || 2,
      max: Number(process.env.DB_POOL_MAX) || 20,
    },
    migrations: {
      directory: path.join(__dirname, 'migrations'),
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: path.join(__dirname, 'seeds'),
    },
  },
};

const environment = process.env.NODE_ENV || 'development';
const activeConfig = knexConfig[environment] || knexConfig.development;

export const db = knex(activeConfig);

/**
 * Checks PostgreSQL database connectivity and retrieves database metadata.
 * @returns {Promise<{ status: string, client: string, message: string, details?: object }>}
 */
export async function checkDbConnection() {
  try {
    const result = await db.raw(
      'SELECT 1 AS result, NOW() AS server_time, current_database() AS database_name, version() AS version'
    );
    const row = result.rows ? result.rows[0] : null;

    return {
      status: 'healthy',
      client: 'PostgreSQL',
      message: 'Database connection established successfully.',
      details: row
        ? {
            database: row.database_name,
            serverTime: formatUtcDateTime(row.server_time),
            version: row.version,
          }
        : null,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      client: 'PostgreSQL',
      message: error.message,
    };
  }
}

export default knexConfig;
