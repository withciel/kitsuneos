import type { KitsuneEngine } from '@kitsuneos/core';
import { KitsuneError, validateCollectionDefinition } from '@kitsuneos/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { createStandardFixture, type Fixture, getEngine } from './fixtures.js';

describe('Schema definition API validation', () => {
  let engine: KitsuneEngine;
  let fixture: Fixture;

  beforeAll(async () => {
    engine = await getEngine();
    fixture = await createStandardFixture(engine);
  });

  it('rejects injection in collection names', async () => {
    expect(() =>
      validateCollectionDefinition({
        name: "'; DROP TABLE accounts--",
        fields: [{ name: 'title', type: 'text' }],
      }),
    ).toThrow(KitsuneError);
  });

  it('rejects invalid field names', async () => {
    expect(() =>
      validateCollectionDefinition({
        name: 'notes',
        fields: [{ name: 'bad-name', type: 'text' }],
      }),
    ).toThrow(KitsuneError);
  });

  it('rejects enum values with injection characters', async () => {
    expect(() =>
      validateCollectionDefinition({
        name: 'statuses',
        fields: [
          {
            name: 'state',
            type: 'enum',
            enumValues: ["open'; DROP TABLE--"],
          },
        ],
      }),
    ).toThrow(KitsuneError);
  });

  it('rejects reserved system column names', async () => {
    await expect(
      engine.defineCollection(fixture.workspaceId, {
        name: 'bad',
        fields: [{ name: '_revision', type: 'text' }],
      }),
    ).rejects.toMatchObject({ code: 'validation' });
  });

  it('rejects id as a field name', async () => {
    await expect(
      engine.defineCollection(fixture.workspaceId, {
        name: 'notes',
        fields: [{ name: 'id', type: 'text' }],
      }),
    ).rejects.toMatchObject({ code: 'validation' });
  });

  it('rejects relation targets that do not exist', async () => {
    await expect(
      engine.defineCollection(fixture.workspaceId, {
        name: 'orphans',
        fields: [
          {
            name: 'parent_id',
            type: 'relation',
            relationTarget: 'nonexistent',
            nullable: false,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'validation' });
  });

  it('creates a valid collection as admin', async () => {
    const id = await engine.defineCollection(fixture.workspaceId, {
      name: 'notes',
      fields: [{ name: 'body', type: 'prose' }],
    });
    expect(id).toBeTruthy();
  });

  it('adds a nullable field, bumps schema_version, and records a revision', async () => {
    const result = await engine.applySchemaChange(
      fixture.workspaceId,
      fixture.adminId,
      {
        collection: 'accounts',
        op: 'addField',
        field: { name: 'region', type: 'text' },
        confirmStaleIds: [],
      },
    );
    expect(result.schemaVersion).toBeGreaterThanOrEqual(2);
    const col = await engine.ownerPool.query<{ schema_version: number }>(
      `SELECT schema_version FROM kitsune.collections WHERE id = $1`,
      [fixture.collections.accounts],
    );
    expect(col.rows[0]?.schema_version).toBe(result.schemaVersion);
    const rev = await engine.ownerPool.query(
      `SELECT op FROM kitsune.schema_revisions WHERE collection_id = $1 AND version = $2`,
      [fixture.collections.accounts, result.schemaVersion],
    );
    expect(rev.rows[0]?.op).toBe('addField');
  });

  it('refuses dropField when an open change set references the field unless confirmed', async () => {
    const accountId = await engine.directWrite(
      fixture.workspaceId,
      fixture.adminId,
      'accounts',
      { name: 'DropCo' },
    );
    const proposed = await engine.proposeChangeSet(
      fixture.workspaceId,
      fixture.adminId,
      {
        operations: [
          {
            collection: 'accounts',
            recordId: accountId,
            op: 'update',
            fieldName: 'industry',
            newValue: 'widgets',
          },
        ],
      },
    );
    const preview = await engine.previewSchemaChange(
      fixture.workspaceId,
      fixture.adminId,
      { collection: 'accounts', op: 'dropField', fieldName: 'industry' },
    );
    expect(preview.incompatibleChangeSetIds).toContain(proposed.changeSetId);
    await expect(
      engine.applySchemaChange(fixture.workspaceId, fixture.adminId, {
        collection: 'accounts',
        op: 'dropField',
        fieldName: 'industry',
        confirmStaleIds: [],
      }),
    ).rejects.toMatchObject({ code: 'validation' });

    const applied = await engine.applySchemaChange(
      fixture.workspaceId,
      fixture.adminId,
      {
        collection: 'accounts',
        op: 'dropField',
        fieldName: 'industry',
        confirmStaleIds: preview.incompatibleChangeSetIds,
      },
    );
    const stale = await engine.ownerPool.query<{ status: string }>(
      `SELECT status FROM kitsune.change_sets WHERE id = $1`,
      [proposed.changeSetId],
    );
    expect(stale.rows[0]?.status).toBe('stale');
    expect(applied.staleChangeSetIds).toContain(proposed.changeSetId);

    await engine.revertSchemaChange(
      fixture.workspaceId,
      fixture.adminId,
      'accounts',
      applied.schemaVersion - 1,
    );
  });

  it('rejects unknown schema operations such as retype', async () => {
    await expect(
      engine.applySchemaChange(fixture.workspaceId, fixture.adminId, {
        collection: 'accounts',
        op: 'retype' as 'addField',
        confirmStaleIds: [],
      }),
    ).rejects.toMatchObject({ code: 'validation' });
  });
});
