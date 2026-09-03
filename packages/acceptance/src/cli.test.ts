import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectExport } from '@kitsuneos/cli/export';
import { init } from '@kitsuneos/cli/init';
import { schemaDiff, schemaPush } from '@kitsuneos/cli/schema';
import { resolveCliWorkspace } from '@kitsuneos/cli/workspace';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createStandardFixture,
  getEngine,
  seedAccount,
  seedOpportunity,
} from './fixtures.js';

describe('CLI workspace, init, schema, and export', () => {
  const previousWorkspace = process.env.KITSUNE_WORKSPACE_ID;
  const previousPrincipal = process.env.KITSUNE_PRINCIPAL_ID;

  afterEach(() => {
    if (previousWorkspace === undefined) {
      delete process.env.KITSUNE_WORKSPACE_ID;
    } else {
      process.env.KITSUNE_WORKSPACE_ID = previousWorkspace;
    }
    if (previousPrincipal === undefined) {
      delete process.env.KITSUNE_PRINCIPAL_ID;
    } else {
      process.env.KITSUNE_PRINCIPAL_ID = previousPrincipal;
    }
  });

  it('writes kitsune.schema.json and .env.example', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kitsune-init-'));
    const written = init(dir);
    expect(written.some((path) => path.endsWith('kitsune.schema.json'))).toBe(
      true,
    );
    const schema = JSON.parse(
      readFileSync(join(dir, 'kitsune.schema.json'), 'utf8'),
    ) as { collections: Array<{ name: string }> };
    expect(schema.collections.map((c) => c.name)).toContain('opportunities');
    expect(readFileSync(join(dir, '.env.example'), 'utf8')).toContain(
      'KITSUNE_WORKSPACE_ID',
    );
  });

  it('resolves workspace from env and query is grant-filtered', async () => {
    const engine = await getEngine();
    const fixture = await createStandardFixture(engine);
    process.env.KITSUNE_WORKSPACE_ID = fixture.workspaceId;
    process.env.KITSUNE_PRINCIPAL_ID = fixture.readerId;
    const ctx = resolveCliWorkspace();
    expect(ctx.workspaceId).toBe(fixture.workspaceId);
    expect(ctx.principalId).toBe(fixture.readerId);
    await expect(
      engine.query(ctx.workspaceId, ctx.principalId, {
        collection: 'opportunities',
        fields: ['amount'],
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('schema diff and push add a field from kitsune.schema.json', async () => {
    const engine = await getEngine();
    const fixture = await createStandardFixture(engine);
    process.env.KITSUNE_WORKSPACE_ID = fixture.workspaceId;
    process.env.KITSUNE_PRINCIPAL_ID = fixture.adminId;
    const dir = mkdtempSync(join(tmpdir(), 'kitsune-schema-'));
    init(dir);
    const schemaPath = join(dir, 'kitsune.schema.json');
    const file = JSON.parse(readFileSync(schemaPath, 'utf8')) as {
      collections: Array<{
        name: string;
        fields: Array<{ name: string; type: string }>;
      }>;
    };
    const opportunities = file.collections.find(
      (collection) => collection.name === 'opportunities',
    );
    expect(opportunities).toBeDefined();
    opportunities?.fields.push({ name: 'notes', type: 'text' });
    writeFileSync(schemaPath, JSON.stringify(file, null, 2));

    const lines = await schemaDiff(engine, dir);
    expect(lines).toContain('+ opportunities.notes');

    await schemaPush(engine, dir);
    const live = await engine.describeSchema(
      fixture.workspaceId,
      fixture.adminId,
    );
    const liveOpps = live.collections.find(
      (collection) => collection.name === 'opportunities',
    );
    expect(liveOpps?.fields.some((field) => field.name === 'notes')).toBe(true);
  });

  it('export is grant-filtered for a non-admin principal', async () => {
    const engine = await getEngine();
    const fixture = await createStandardFixture(engine);
    const accountId = await seedAccount(engine, fixture, { name: 'ExportCo' });
    await seedOpportunity(engine, fixture, {
      account_id: accountId,
      name: 'Export Opp',
      stage: 'prospecting',
      amount: 77,
    });
    process.env.KITSUNE_WORKSPACE_ID = fixture.workspaceId;
    process.env.KITSUNE_PRINCIPAL_ID = fixture.readerId;
    const payload = await collectExport(
      engine,
      fixture.workspaceId,
      fixture.readerId,
    );
    const oppSchema = payload.schema.collections.find(
      (collection) => collection.name === 'opportunities',
    );
    expect(oppSchema?.fields.map((field) => field.name)).not.toContain(
      'amount',
    );
    expect(payload.schema.collections.map((c) => c.name)).not.toContain(
      'accounts',
    );
    const rows = payload.collections.opportunities as Array<
      Record<string, unknown>
    >;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).not.toHaveProperty('amount');
    }
  });
});
