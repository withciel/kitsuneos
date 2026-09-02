import { DEFAULT_CONFIG, KitsuneEngine } from '@kitsuneos/core';
import { setEngine } from '@/lib/require-workspace';

function configFromEnv() {
  return {
    ownerUrl: process.env.KITSUNE_OWNER_URL ?? DEFAULT_CONFIG.ownerUrl,
    appUrl: process.env.KITSUNE_APP_URL ?? DEFAULT_CONFIG.appUrl,
  };
}

const engine = new KitsuneEngine({ config: configFromEnv() });
setEngine(engine);

export { engine };
