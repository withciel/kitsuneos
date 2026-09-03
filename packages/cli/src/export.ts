import { KitsuneEngine } from '@kitsuneos/core';
import { APP_URL, OWNER_URL } from './postgres.js';
import { resolveCliWorkspace } from './workspace.js';

export interface WorkspaceExport {
  schema: Awaited<ReturnType<KitsuneEngine['describeSchema']>>;
  collections: Record<string, unknown[]>;
}

export async function collectExport(
  engine: KitsuneEngine,
  workspaceId: string,
  principalId: string,
): Promise<WorkspaceExport> {
  const schema = await engine.describeSchema(workspaceId, principalId);
  const collections: Record<string, unknown[]> = {};
  for (const collection of schema.collections) {
    collections[collection.name] = await engine.query(
      workspaceId,
      principalId,
      { collection: collection.name },
    );
  }
  return { schema, collections };
}

export async function exportWorkspace(): Promise<void> {
  const engine = new KitsuneEngine({
    config: { ownerUrl: OWNER_URL, appUrl: APP_URL },
  });
  try {
    const { workspaceId, principalId } = resolveCliWorkspace();
    const payload = await collectExport(engine, workspaceId, principalId);
    console.log(JSON.stringify(payload, null, 2));
  } finally {
    await engine.close();
  }
}
