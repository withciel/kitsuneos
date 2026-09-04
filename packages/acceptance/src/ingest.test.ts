import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseIngestSource } from '../../cli/src/ingest-parse.js';
import { createStandardFixture, getEngine } from './fixtures.js';

describe('ingest connectors', () => {
  it('admin direct-writes KB markdown into a collection', async () => {
    const engine = await getEngine();
    const fixture = await createStandardFixture(engine);
    await engine.defineCollection(fixture.workspaceId, {
      name: 'articles',
      fields: [
        { name: 'title', type: 'text', nullable: false },
        { name: 'body', type: 'prose' },
      ],
    });
    await engine.createGrant(
      fixture.workspaceId,
      fixture.adminId,
      (
        await engine.ownerPool.query(
          `SELECT id FROM kitsune.collections WHERE workspace_id = $1 AND name = 'articles'`,
          [fixture.workspaceId],
        )
      ).rows[0].id,
      'admin',
      null,
      null,
      { actorId: fixture.adminId },
    );

    const dir = join(tmpdir(), `kitsune-kb-${Date.now()}`);
    mkdirSync(dir);
    writeFileSync(
      join(dir, 'hello.md'),
      '---\ntitle: Hello\n---\n# Body\n\nGrant-aware search notes.\n',
    );

    const batch = parseIngestSource({
      source: 'kb',
      path: dir,
      collection: 'articles',
    });
    expect(batch.records).toHaveLength(1);
    expect(batch.records[0]?.fields.title).toBe('Hello');

    const result = await engine.ingest(
      fixture.workspaceId,
      fixture.adminId,
      batch,
    );
    expect(result.errors).toEqual([]);
    expect(result.written).toHaveLength(1);

    const rows = await engine.query(fixture.workspaceId, fixture.adminId, {
      collection: 'articles',
      fields: ['title', 'body'],
    });
    expect(rows.some((r) => r.title === 'Hello')).toBe(true);
  });

  it('agent ingest proposes instead of writing', async () => {
    const engine = await getEngine();
    const fixture = await createStandardFixture(engine);
    const articlesId = await engine.defineCollection(fixture.workspaceId, {
      name: 'notes',
      fields: [
        { name: 'title', type: 'text', nullable: false },
        { name: 'body', type: 'prose' },
      ],
    });
    await engine.createGrant(
      fixture.workspaceId,
      fixture.adminId,
      articlesId,
      'admin',
      null,
      null,
      { actorId: fixture.adminId },
    );
    await engine.createGrant(
      fixture.workspaceId,
      fixture.agentId,
      articlesId,
      'propose',
      ['title', 'body'],
      null,
      { actorId: fixture.adminId },
    );

    const result = await engine.ingest(fixture.workspaceId, fixture.agentId, {
      collection: 'notes',
      records: [{ fields: { title: 'Agent note', body: 'Proposed body' } }],
    });
    expect(result.written).toEqual([]);
    expect(result.changeSetIds).toHaveLength(1);
    expect(result.errors).toEqual([]);
  });

  it('CRM CSV maps columns into accounts', async () => {
    const engine = await getEngine();
    const fixture = await createStandardFixture(engine);
    const dir = join(tmpdir(), `kitsune-crm-${Date.now()}`);
    mkdirSync(dir);
    const csvPath = join(dir, 'accounts.csv');
    writeFileSync(csvPath, 'Company,Sector\nIngestCo,software\n');

    const batch = parseIngestSource({
      source: 'crm',
      path: csvPath,
      collection: 'accounts',
      fieldMap: { name: 'Company', industry: 'Sector' },
    });
    const result = await engine.ingest(
      fixture.workspaceId,
      fixture.adminId,
      batch,
    );
    expect(result.errors).toEqual([]);
    expect(result.written).toHaveLength(1);
    const rows = await engine.query(fixture.workspaceId, fixture.adminId, {
      collection: 'accounts',
      fields: ['name', 'industry'],
    });
    expect(
      rows.some((r) => r.name === 'IngestCo' && r.industry === 'software'),
    ).toBe(true);
  });
});
