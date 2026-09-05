import type { KitsuneEngine } from '@kitsuneos/core';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createStandardFixture,
  type Fixture,
  getEngine,
  getRevisionCount,
  seedAccount,
} from './fixtures.js';

async function applyNameUpdate(
  engine: KitsuneEngine,
  fixture: Fixture,
  accountId: string,
  name: string,
): Promise<void> {
  const cs = await engine.proposeChangeSet(
    fixture.workspaceId,
    fixture.agentId,
    {
      operations: [
        {
          collection: 'accounts',
          recordId: accountId,
          op: 'update',
          fieldName: 'name',
          newValue: name,
        },
      ],
    },
  );
  await engine.reviewChangeSet(
    fixture.workspaceId,
    fixture.reviewerId,
    cs.changeSetId,
    cs.operationIds.map((opId) => ({ opId, status: 'approved' as const })),
  );
  const result = await engine.applyChangeSet(
    fixture.workspaceId,
    fixture.reviewerId,
    cs.changeSetId,
  );
  expect(result.status).toBe('applied');
}

describe('Revision retention sweeper', () => {
  let engine: KitsuneEngine;
  let fixture: Fixture;

  beforeAll(async () => {
    engine = await getEngine();
    fixture = await createStandardFixture(engine);
  });

  it('deletes __rev rows older than revision_retention_days; null means forever', async () => {
    const accountId = await seedAccount(engine, fixture, {
      name: 'RetentionCo',
    });
    await applyNameUpdate(engine, fixture, accountId, 'RetentionCo v2');
    await applyNameUpdate(engine, fixture, accountId, 'RetentionCo v3');

    const before = await getRevisionCount(
      engine,
      fixture.schemaName,
      'accounts',
      accountId,
    );
    expect(before).toBeGreaterThanOrEqual(3);

    await engine.setRevisionRetentionDays(
      fixture.workspaceId,
      fixture.adminId,
      'accounts',
      1,
    );

    await engine.ownerPool.query(
      `UPDATE ${fixture.schemaName}.accounts__rev
          SET valid_from = now() - interval '3 days'
        WHERE record_id = $1
          AND revision < (
            SELECT max(revision)
              FROM ${fixture.schemaName}.accounts__rev
             WHERE record_id = $1
          )`,
      [accountId],
    );

    const swept = await engine.sweepRevisions(
      fixture.workspaceId,
      fixture.adminId,
    );
    expect(swept.deleted).toBeGreaterThanOrEqual(2);
    expect(
      swept.collections.find((c) => c.collection === 'accounts')?.deleted,
    ).toBeGreaterThanOrEqual(2);

    const after = await getRevisionCount(
      engine,
      fixture.schemaName,
      'accounts',
      accountId,
    );
    expect(after).toBe(1);

    await expect(
      engine.sweepRevisions(fixture.workspaceId, fixture.readerId),
    ).rejects.toMatchObject({ code: 'not_found' });

    await engine.setRevisionRetentionDays(
      fixture.workspaceId,
      fixture.adminId,
      'accounts',
      null,
    );
    await engine.ownerPool.query(
      `UPDATE ${fixture.schemaName}.accounts__rev
          SET valid_from = now() - interval '30 days'
        WHERE record_id = $1`,
      [accountId],
    );
    const second = await engine.sweepRevisions(
      fixture.workspaceId,
      fixture.adminId,
    );
    expect(
      second.collections.find((c) => c.collection === 'accounts'),
    ).toBeUndefined();
    expect(
      await getRevisionCount(
        engine,
        fixture.schemaName,
        'accounts',
        accountId,
      ),
    ).toBe(1);
  });
});
