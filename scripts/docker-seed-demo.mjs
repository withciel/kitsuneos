#!/usr/bin/env node
/**
 * Seeds a local-demo workspace/user when KITSUNE_LOCAL_DEMO=1.
 * Safe to re-run: provisionUserWorkspace is idempotent per workos id.
 */
import { DEFAULT_CONFIG, KitsuneEngine } from '../packages/core/dist/index.js';
import { provisionUserWorkspace } from '../packages/provisioning/dist/index.js';

export async function seedLocalDemo() {
  if (process.env.KITSUNE_LOCAL_DEMO !== '1') {
    return null;
  }

  const workosId = process.env.KITSUNE_DEMO_WORKOS_ID ?? 'local-demo-user';
  const email = process.env.KITSUNE_DEMO_EMAIL ?? 'demo@localhost';

  const engine = new KitsuneEngine({
    config: {
      ownerUrl: process.env.KITSUNE_OWNER_URL ?? DEFAULT_CONFIG.ownerUrl,
      appUrl: process.env.KITSUNE_APP_URL ?? DEFAULT_CONFIG.appUrl,
    },
  });

  try {
    const result = await provisionUserWorkspace(engine, { workosId, email });
    console.log(
      `Local demo ready (workos_id=${workosId}, workspace=${result.workspaceId}, created=${result.created.join(',') || 'none'}, skipped=${result.skipped.join(',') || 'none'})`,
    );
    return result;
  } finally {
    await engine.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedLocalDemo().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
