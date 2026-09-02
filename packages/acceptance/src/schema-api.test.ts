import { describe, expect, it, beforeAll } from 'vitest';
import { getEngine, createStandardFixture, type Fixture } from './fixtures.js';
import { validateCollectionDefinition } from '@kitsuneos/core';
import { KitsuneError } from '@kitsuneos/core';
import type { KitsuneEngine } from '@kitsuneos/core';

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
          { name: 'parent_id', type: 'relation', relationTarget: 'nonexistent', nullable: false },
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
});
