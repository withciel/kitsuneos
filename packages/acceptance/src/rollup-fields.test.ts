import type { KitsuneEngine } from '@kitsuneos/core';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createStandardFixture,
  type Fixture,
  getEngine,
  seedAccount,
  seedOpportunity,
} from './fixtures.js';

async function approveAndApply(
  engine: KitsuneEngine,
  fixture: Fixture,
  changeSetId: string,
  operationIds: string[],
): Promise<void> {
  await engine.reviewChangeSet(
    fixture.workspaceId,
    fixture.reviewerId,
    changeSetId,
    operationIds.map((opId) => ({ opId, status: 'approved' as const })),
  );
  const result = await engine.applyChangeSet(
    fixture.workspaceId,
    fixture.reviewerId,
    changeSetId,
  );
  expect(result.status).toBe('applied');
}

describe('R10 rollup fields', () => {
  let engine: KitsuneEngine;
  let fixture: Fixture;

  beforeAll(async () => {
    engine = await getEngine();
    fixture = await createStandardFixture(engine);

    await engine.applySchemaChange(fixture.workspaceId, fixture.adminId, {
      collection: 'accounts',
      op: 'addField',
      field: { name: 'pipeline_total', type: 'number', nullable: true },
      confirmStaleIds: [],
    });

    await engine.setFieldRollup(
      fixture.workspaceId,
      fixture.adminId,
      'accounts',
      'pipeline_total',
      {
        sourceCollection: 'opportunities',
        foreignKeyField: 'account_id',
        aggregate: 'sum',
        valueField: 'amount',
      },
    );
  });

  it('maintains account pipeline_total from opportunity amounts', async () => {
    const accountId = await seedAccount(engine, fixture, {
      name: 'RollupCo',
    });

    await seedOpportunity(engine, fixture, {
      account_id: accountId,
      name: 'Deal A',
      amount: 100,
      stage: 'prospecting',
    });
    await seedOpportunity(engine, fixture, {
      account_id: accountId,
      name: 'Deal B',
      amount: 250,
      stage: 'negotiation',
    });

    const afterInsert = await engine.readRecord(
      fixture.workspaceId,
      fixture.adminId,
      'accounts',
      accountId,
      ['pipeline_total'],
    );
    expect(Number(afterInsert?.pipeline_total)).toBe(350);

    const oppId = await seedOpportunity(engine, fixture, {
      account_id: accountId,
      name: 'Deal C',
      amount: 50,
      stage: 'prospecting',
    });

    const cs = await engine.proposeChangeSet(
      fixture.workspaceId,
      fixture.adminId,
      {
        operations: [
          {
            collection: 'opportunities',
            recordId: oppId,
            op: 'update',
            fieldName: 'amount',
            newValue: 150,
          },
        ],
      },
    );
    await approveAndApply(engine, fixture, cs.changeSetId, cs.operationIds);

    const afterUpdate = await engine.readRecord(
      fixture.workspaceId,
      fixture.adminId,
      'accounts',
      accountId,
      ['pipeline_total'],
    );
    expect(Number(afterUpdate?.pipeline_total)).toBe(500);
  });

  it('rejects proposes and direct writes to rollup fields', async () => {
    const accountId = await seedAccount(engine, fixture, {
      name: 'ProtectedRollup',
    });

    await expect(
      engine.directWrite(fixture.workspaceId, fixture.adminId, 'accounts', {
        name: 'Nope',
        pipeline_total: 999,
      }),
    ).rejects.toMatchObject({ code: 'validation' });

    await expect(
      engine.proposeChangeSet(fixture.workspaceId, fixture.agentId, {
        operations: [
          {
            collection: 'accounts',
            recordId: accountId,
            op: 'update',
            fieldName: 'pipeline_total',
            newValue: 999,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'validation' });
  });
});
