import type { QueryRequest } from '@kitsuneos/core';
import { KitsuneEngine } from '@kitsuneos/core';
import { APP_URL, OWNER_URL } from './postgres.js';
import { resolveCliWorkspace } from './workspace.js';

export async function queryCommand(args: string[]): Promise<void> {
  const collectionIndex = args.indexOf('--collection');
  const jsonIndex = args.indexOf('--json');
  const collection =
    collectionIndex >= 0 ? args[collectionIndex + 1] : undefined;
  const rawJson = jsonIndex >= 0 ? args[jsonIndex + 1] : undefined;
  if (!collection) {
    console.log(
      'Usage: kitsuneos query --collection NAME [--json \'{ "fields": ["name"] }\']',
    );
    process.exitCode = 1;
    return;
  }
  const extra = rawJson
    ? (JSON.parse(rawJson) as Omit<QueryRequest, 'collection'>)
    : {};
  const engine = new KitsuneEngine({
    config: { ownerUrl: OWNER_URL, appUrl: APP_URL },
  });
  try {
    const { workspaceId, principalId } = resolveCliWorkspace();
    const rows = await engine.query(workspaceId, principalId, {
      collection,
      ...extra,
    });
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    await engine.close();
  }
}
