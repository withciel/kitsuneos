#!/usr/bin/env node
/**
 * Creates kitsune_owner and kitsune_app roles on a fresh RDS instance.
 */
import pg from 'pg';

/** Postgres string literal; CREATE ROLE ... PASSWORD does not accept bind params. */
function quoteLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export async function bootstrapRds() {
  const adminUrl =
    process.env.KITSUNE_ADMIN_URL ?? process.env.KITSUNE_OWNER_URL ?? '';
  const ownerPassword = process.env.KITSUNE_OWNER_PASSWORD ?? '';
  const appPassword = process.env.KITSUNE_APP_PASSWORD ?? '';

  if (!adminUrl || !ownerPassword || !appPassword) {
    throw new Error(
      'bootstrap-rds: missing KITSUNE_ADMIN_URL/KITSUNE_OWNER_URL, KITSUNE_OWNER_PASSWORD, or KITSUNE_APP_PASSWORD',
    );
  }

  const pool = new pg.Pool({
    connectionString: adminUrl.split('?')[0],
    // RDS requires TLS; do not put sslmode=require in the URL (pg maps it to verify-full).
    ssl:
      adminUrl.includes('localhost') || adminUrl.includes('127.0.0.1')
        ? undefined
        : { rejectUnauthorized: false },
  });
  try {
    const ownerExists = await pool.query(
      `SELECT 1 FROM pg_roles WHERE rolname = 'kitsune_owner'`,
    );
    if (ownerExists.rowCount === 0) {
      await pool.query(
        `CREATE ROLE kitsune_owner WITH LOGIN PASSWORD ${quoteLiteral(ownerPassword)} CREATEDB`,
      );
    }

    const appExists = await pool.query(
      `SELECT 1 FROM pg_roles WHERE rolname = 'kitsune_app'`,
    );
    if (appExists.rowCount === 0) {
      await pool.query(
        `CREATE ROLE kitsune_app WITH LOGIN PASSWORD ${quoteLiteral(appPassword)} NOSUPERUSER NOBYPASSRLS`,
      );
    }

    try {
      await pool.query(`GRANT kitsune_owner TO CURRENT_USER`);
    } catch (error) {
      // When admin already is kitsune_owner (local docker-compose / db-init),
      // self-grant is not allowed. Roles existing is enough.
      const message = error instanceof Error ? error.message : String(error);
      if (!/permission denied to grant role/i.test(message)) {
        throw error;
      }
      console.log(
        'RDS bootstrap: skipped self-grant (expected when admin is kitsune_owner)',
      );
    }
    console.log('RDS bootstrap complete');
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  bootstrapRds().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
