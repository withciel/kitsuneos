import type { Pool, PoolClient, QueryResultRow } from 'pg';
import pg from 'pg';
import type { DbConfig } from '../types.js';
import { assertSchemaName, assertUuid } from '../types.js';

function poolConfig(connectionString: string, max: number) {
  const local =
    connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1');
  // Strip sslmode from URL — pg maps require→verify-full and breaks on RDS CA chains.
  const url = connectionString.split('?')[0] ?? connectionString;
  return {
    connectionString: url,
    max,
    // Managed Postgres (RDS) requires TLS; CA pinning can wait until we ship the RDS bundle.
    ...(local ? {} : { ssl: { rejectUnauthorized: false } }),
  };
}

export function createPools(
  config: DbConfig,
  options?: { ownerMax?: number; appMax?: number },
): {
  ownerPool: Pool;
  appPool: Pool;
} {
  return {
    ownerPool: new pg.Pool(
      poolConfig(config.ownerUrl, options?.ownerMax ?? 10),
    ),
    appPool: new pg.Pool(poolConfig(config.appUrl, options?.appMax ?? 20)),
  };
}

export async function withOwner<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function withAppTransaction<T>(
  pool: Pool,
  context: {
    schemaName: string;
    principalId: string;
    includeDeleted?: boolean;
  },
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setSessionContext(client, context);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function setSessionContext(
  client: PoolClient,
  context: {
    schemaName: string;
    principalId: string;
    includeDeleted?: boolean;
  },
): Promise<void> {
  assertSchemaName(context.schemaName);
  assertUuid(context.principalId, 'principalId');

  await client.query(`SELECT set_config('kitsune.schema_name', $1, true)`, [
    context.schemaName,
  ]);
  await client.query(`SELECT set_config('kitsune.principal_id', $1, true)`, [
    context.principalId,
  ]);
  await client.query(`SELECT set_config('kitsune.include_deleted', $1, true)`, [
    context.includeDeleted ? 'true' : 'false',
  ]);
}

export async function queryRows<T extends QueryResultRow>(
  client: PoolClient,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await client.query<T>(sql, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(
  client: PoolClient,
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await queryRows<T>(client, sql, params);
  return rows[0] ?? null;
}
