import { CONTROL_PLANE_MIGRATION } from '../db/migration.js';
import { createPools } from '../db/pool.js';
import type { DbConfig } from '../types.js';

const DEFAULT_CONFIG: DbConfig = {
  ownerUrl:
    process.env.KITSUNE_OWNER_URL ??
    'postgresql://kitsune_owner:kitsune_owner@localhost:5432/kitsune',
  appUrl:
    process.env.KITSUNE_APP_URL ??
    'postgresql://kitsune_app:kitsune_app@localhost:5432/kitsune',
};

export async function migrate(config: DbConfig = DEFAULT_CONFIG): Promise<void> {
  const { ownerPool } = createPools(config);
  const client = await ownerPool.connect();
  try {
    await client.query(CONTROL_PLANE_MIGRATION);
    console.log('Control plane migration complete');
  } finally {
    client.release();
    await ownerPool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
