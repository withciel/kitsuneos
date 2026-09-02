#!/usr/bin/env node
/**
 * Creates kitsune_owner and kitsune_app roles on a fresh RDS instance.
 */
import pg from 'pg';

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

  const pool = new pg.Pool({ connectionString: adminUrl });
  try {
    const ownerExists = await pool.query(
      `SELECT 1 FROM pg_roles WHERE rolname = 'kitsune_owner'`,
    );
    if (ownerExists.rowCount === 0) {
      await pool.query(
        `CREATE ROLE kitsune_owner WITH LOGIN PASSWORD $1 CREATEDB`,
        [ownerPassword],
      );
    }

    const appExists = await pool.query(
      `SELECT 1 FROM pg_roles WHERE rolname = 'kitsune_app'`,
    );
    if (appExists.rowCount === 0) {
      await pool.query(
        `CREATE ROLE kitsune_app WITH LOGIN PASSWORD $1 NOSUPERUSER NOBYPASSRLS`,
        [appPassword],
      );
    }

    await pool.query(`GRANT kitsune_owner TO CURRENT_USER`);
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
