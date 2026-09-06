/**
 * Smoke: wiki-link extraction, page_links storage, and backlinks API shape.
 * Run: node --import tsx packages/core/scripts/wiki-links-smoke.ts
 */

import {
  ensureNotesCollection,
  NOTES_COLLECTION,
} from '../../provisioning/src/seed-collections.ts';
import {
  createPools,
  extractWikiLinks,
  KitsuneEngine,
  migrate,
} from '../src/index.ts';

const ownerUrl =
  process.env.KITSUNE_OWNER_URL ??
  'postgresql://kitsune_owner:kitsune_owner@localhost:5432/kitsune';
const appUrl =
  process.env.KITSUNE_APP_URL ??
  'postgresql://kitsune_app:kitsune_app@localhost:5432/kitsune';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  // Pure extract checks (no DB)
  const parsed = extractWikiLinks(
    'See [[Other Title]] and [[notes:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee|alias]] plus [[Missing Page]].',
  );
  assert(parsed.length === 3, `expected 3 links, got ${parsed.length}`);
  assert(parsed[0]?.rawTarget === 'Other Title', 'title link');
  assert(parsed[1]?.collectionHint === 'notes', 'collection hint');
  assert(parsed[1]?.alias === 'alias', 'alias');
  console.log('extract: ok');

  const { ownerPool, appPool } = createPools({ ownerUrl, appUrl });
  const engine = new KitsuneEngine({ ownerPool, appPool });

  try {
    await migrate({ ownerUrl, appUrl });

    const ws = await ownerPool.query<{
      id: string;
      principal_id: string;
    }>(
      `SELECT w.id, p.id AS principal_id
         FROM kitsune.workspaces w
         JOIN kitsune.principals p ON p.workspace_id = w.id
        WHERE w.slug <> '_system'
          AND p.kind = 'human'
          AND p.disabled_at IS NULL
        ORDER BY w.created_at DESC
        LIMIT 1`,
    );
    assert(ws.rows[0], 'need a workspace with a human principal');
    const workspaceId = ws.rows[0].id;
    const principalId = ws.rows[0].principal_id;

    const ensured = await ensureNotesCollection(
      engine,
      workspaceId,
      principalId,
    );
    assert(ensured.collectionId, 'notes collection id');

    const stamp = Date.now();
    const otherTitle = `Wiki Target ${stamp}`;
    const sourceTitle = `Wiki Source ${stamp}`;

    const otherId = await engine.directWrite(
      workspaceId,
      principalId,
      NOTES_COLLECTION,
      { title: otherTitle, body: 'target note body', tags: 'wiki-smoke' },
    );
    const sourceId = await engine.directWrite(
      workspaceId,
      principalId,
      NOTES_COLLECTION,
      {
        title: sourceTitle,
        body: `Linking to [[${otherTitle}]] and [[No Such Page ${stamp}]].`,
        tags: 'wiki-smoke',
      },
    );
    console.log(`notes: source=${sourceId} target=${otherId}`);

    const linkRows = await ownerPool.query<{
      raw_target: string;
      to_record_id: string | null;
    }>(
      `SELECT raw_target, to_record_id
         FROM kitsune.page_links
        WHERE workspace_id = $1
          AND from_collection_id = $2
          AND from_record_id = $3
        ORDER BY raw_target`,
      [workspaceId, ensured.collectionId, sourceId],
    );
    assert(
      linkRows.rows.length === 2,
      `expected 2 link rows, got ${linkRows.rows.length}`,
    );
    const resolved = linkRows.rows.find((r) => r.to_record_id === otherId);
    const unresolved = linkRows.rows.find((r) => r.to_record_id === null);
    assert(resolved, 'resolved link should point at target note');
    assert(unresolved, 'unresolved link should keep null to_*');
    console.log('page_links: resolved + unresolved ok');

    const backlinks = await engine.listBacklinks(
      workspaceId,
      principalId,
      NOTES_COLLECTION,
      otherId,
    );
    assert(
      Array.isArray(backlinks.outgoing) && Array.isArray(backlinks.incoming),
      'backlinks shape',
    );
    assert(
      backlinks.incoming.some(
        (n) => n.recordId === sourceId && n.rawTarget === otherTitle,
      ),
      'target should see source as incoming backlink',
    );

    const sourceLinks = await engine.listBacklinks(
      workspaceId,
      principalId,
      NOTES_COLLECTION,
      sourceId,
    );
    assert(
      sourceLinks.outgoing.some(
        (n) => n.recordId === otherId && n.collection === NOTES_COLLECTION,
      ),
      'source outgoing should include target',
    );
    assert(
      sourceLinks.outgoing.some(
        (n) => !n.recordId && n.rawTarget.includes('No Such Page'),
      ),
      'source outgoing should include unresolved raw target',
    );
    console.log('listBacklinks: shape ok');

    const wikiEdges = await engine.listWikiLinkEdges(workspaceId, principalId);
    assert(
      wikiEdges.some(
        (e) =>
          e.fromRecordId === sourceId &&
          e.toRecordId === otherId &&
          e.rawTarget === otherTitle,
      ),
      'visible wiki edges should include resolved link',
    );
    console.log('listWikiLinkEdges: ok');

    console.log('OK wiki-links-smoke');
  } finally {
    await ownerPool.end();
    await appPool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
