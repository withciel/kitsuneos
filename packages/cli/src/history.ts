import { KitsuneEngine, quoteIdent } from '@kitsuneos/core';
import { DEMO, DEMO_SCHEMA_NAME } from './demo.js';
import { APP_URL, OWNER_URL } from './postgres.js';

interface RevisionRow {
  revision: string;
  changed_fields: string[];
  snapshot: Record<string, unknown>;
  valid_from: Date;
  author: string | null;
  author_kind: string | null;
  change_set_id: string | null;
}

export async function history(args: string[]): Promise<void> {
  const [collection, recordId] = args;
  if (!collection || !recordId) {
    console.log('Usage: pnpm history <collection> <record-id>');
    process.exitCode = 1;
    return;
  }

  const engine = new KitsuneEngine({ config: { ownerUrl: OWNER_URL, appUrl: APP_URL } });
  try {
    const exists = await engine.ownerPool.query(
      `SELECT 1 FROM kitsune.collections WHERE workspace_id = $1 AND name = $2`,
      [DEMO.workspaceId, collection],
    );
    if (exists.rows.length === 0) {
      console.error(`No collection "${collection}" in the demo workspace.`);
      process.exitCode = 1;
      return;
    }

    const revisions = await engine.ownerPool.query<RevisionRow>(
      `SELECT r.revision, r.changed_fields, r.snapshot, r.valid_from, r.change_set_id,
              p.display_name AS author, p.kind AS author_kind
         FROM ${quoteIdent(DEMO_SCHEMA_NAME)}.${quoteIdent(`${collection}__rev`)} r
         LEFT JOIN kitsune.principals p ON p.id = r.principal_id
        WHERE r.record_id = $1
        ORDER BY r.revision`,
      [recordId],
    );

    if (revisions.rows.length === 0) {
      console.error(`No history for ${collection} ${recordId}.`);
      process.exitCode = 1;
      return;
    }

    console.log(`history for ${collection} ${recordId}\n`);
    for (const revision of revisions.rows) {
      const who = revision.author
        ? `${revision.author} (${revision.author_kind})`
        : 'unknown principal';
      console.log(`  revision ${revision.revision}  ${revision.valid_from.toISOString()}`);
      console.log(`    by       ${who}`);
      console.log(`    changed  ${revision.changed_fields.join(', ') || '(none)'}`);
      if (revision.change_set_id) {
        console.log(`    via change set ${revision.change_set_id}`);
      }
      for (const field of revision.changed_fields) {
        console.log(`    ${field} = ${JSON.stringify(revision.snapshot[field] ?? null)}`);
      }
      console.log('');
    }
  } finally {
    await engine.close();
  }
}
