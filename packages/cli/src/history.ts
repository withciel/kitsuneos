import { KitsuneEngine } from '@kitsuneos/core';
import { APP_URL, OWNER_URL } from './postgres.js';
import { resolveCliWorkspace } from './workspace.js';

export async function history(args: string[]): Promise<void> {
  const [collection, recordId] = args;
  if (!collection || !recordId) {
    console.log('Usage: kitsuneos history <collection> <record-id>');
    process.exitCode = 1;
    return;
  }

  const engine = new KitsuneEngine({
    config: { ownerUrl: OWNER_URL, appUrl: APP_URL },
  });
  try {
    const { workspaceId, principalId } = resolveCliWorkspace();
    const listed = await engine.listRecordRevisions(
      workspaceId,
      principalId,
      collection,
      recordId,
      { limit: 100 },
    );
    if (listed.revisions.length === 0) {
      console.error(`No history for ${collection} ${recordId}.`);
      process.exitCode = 1;
      return;
    }

    console.log(`history for ${collection} ${recordId}\n`);
    for (const revision of listed.revisions) {
      console.log(`  revision ${revision.revision}  ${revision.validFrom}`);
      console.log(`    by       ${revision.principalId}`);
      console.log(
        `    changed  ${revision.changedFields.join(', ') || '(none)'}`,
      );
      if (revision.changeSetId) {
        console.log(`    via change set ${revision.changeSetId}`);
      }
      const snapshot = await engine.readRecordAt(
        workspaceId,
        principalId,
        collection,
        recordId,
        { revision: revision.revision },
      );
      for (const field of revision.changedFields) {
        console.log(
          `    ${field} = ${JSON.stringify(snapshot?.[field] ?? null)}`,
        );
      }
      console.log('');
    }
  } finally {
    await engine.close();
  }
}
