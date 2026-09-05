import type { KitsuneEngine } from '@kitsuneos/core';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createStandardFixture,
  type Fixture,
  getEngine,
  seedAccount,
} from './fixtures.js';

async function proposeAndApprove(
  engine: KitsuneEngine,
  fixture: Fixture,
  accountId: string,
  fieldName: string,
  newValue: string,
): Promise<string> {
  const proposed = await engine.proposeChangeSet(
    fixture.workspaceId,
    fixture.adminId,
    {
      operations: [
        {
          collection: 'accounts',
          recordId: accountId,
          op: 'update',
          fieldName,
          newValue,
        },
      ],
    },
  );
  await engine.reviewChangeSet(
    fixture.workspaceId,
    fixture.reviewerId,
    proposed.changeSetId,
    proposed.operationIds.map((opId) => ({
      opId,
      status: 'approved' as const,
    })),
  );
  return proposed.changeSetId;
}

describe('R14 agent-tempo merge queue', () => {
  let engine: KitsuneEngine;
  let fixture: Fixture;

  beforeAll(async () => {
    engine = await getEngine();
    fixture = await createStandardFixture(engine);
  });

  it('applies disjoint field sets in enqueue order', async () => {
    const accountId = await seedAccount(engine, fixture, {
      name: 'MergeQueueCo',
      industry: 'software',
    });

    const nameSetId = await proposeAndApprove(
      engine,
      fixture,
      accountId,
      'name',
      'MergedName',
    );
    const industrySetId = await proposeAndApprove(
      engine,
      fixture,
      accountId,
      'industry',
      'finance',
    );

    await engine.enqueueMerge(
      fixture.workspaceId,
      fixture.reviewerId,
      nameSetId,
    );
    await engine.enqueueMerge(
      fixture.workspaceId,
      fixture.reviewerId,
      industrySetId,
    );

    const processed = await engine.processMergeQueue(
      fixture.workspaceId,
      fixture.reviewerId,
      { limit: 10 },
    );
    expect(processed).toHaveLength(2);
    expect(processed.map((p) => p.status)).toEqual(['applied', 'applied']);
    expect(processed.map((p) => p.changeSetId)).toEqual([
      nameSetId,
      industrySetId,
    ]);

    const row = await engine.readRecord(
      fixture.workspaceId,
      fixture.adminId,
      'accounts',
      accountId,
      ['name', 'industry'],
    );
    expect(row?.name).toBe('MergedName');
    expect(row?.industry).toBe('finance');
  });

  it('blocks overlapping fields and continues with later disjoint sets', async () => {
    const accountId = await seedAccount(engine, fixture, {
      name: 'ConflictQueueCo',
      industry: 'software',
    });

    const firstName = await proposeAndApprove(
      engine,
      fixture,
      accountId,
      'name',
      'FirstWins',
    );
    const secondName = await proposeAndApprove(
      engine,
      fixture,
      accountId,
      'name',
      'SecondLoses',
    );
    const industry = await proposeAndApprove(
      engine,
      fixture,
      accountId,
      'industry',
      'healthcare',
    );

    // Apply the first set directly so the second starts from a stale base.
    const direct = await engine.applyChangeSet(
      fixture.workspaceId,
      fixture.reviewerId,
      firstName,
    );
    expect(direct.status).toBe('applied');

    await engine.enqueueMerge(
      fixture.workspaceId,
      fixture.reviewerId,
      secondName,
    );
    await engine.enqueueMerge(
      fixture.workspaceId,
      fixture.reviewerId,
      industry,
    );

    const processed = await engine.processMergeQueue(
      fixture.workspaceId,
      fixture.reviewerId,
      { limit: 10 },
    );
    expect(processed).toHaveLength(2);
    expect(processed[0]?.changeSetId).toBe(secondName);
    expect(processed[0]?.status).toBe('blocked');
    expect(processed[1]?.changeSetId).toBe(industry);
    expect(processed[1]?.status).toBe('applied');

    const row = await engine.readRecord(
      fixture.workspaceId,
      fixture.adminId,
      'accounts',
      accountId,
      ['name', 'industry'],
    );
    expect(row?.name).toBe('FirstWins');
    expect(row?.industry).toBe('healthcare');

    const queue = await engine.listMergeQueue(
      fixture.workspaceId,
      fixture.adminId,
    );
    expect(
      queue.some((e) => e.changeSetId === secondName && e.status === 'blocked'),
    ).toBe(true);
    expect(
      queue.some((e) => e.changeSetId === industry && e.status === 'applied'),
    ).toBe(true);
  });

  it('rejects enqueue before review is complete', async () => {
    const accountId = await seedAccount(engine, fixture, {
      name: 'UnreviewedCo',
    });
    const proposed = await engine.proposeChangeSet(
      fixture.workspaceId,
      fixture.adminId,
      {
        operations: [
          {
            collection: 'accounts',
            recordId: accountId,
            op: 'update',
            fieldName: 'name',
            newValue: 'Nope',
          },
        ],
      },
    );

    await expect(
      engine.enqueueMerge(
        fixture.workspaceId,
        fixture.reviewerId,
        proposed.changeSetId,
      ),
    ).rejects.toMatchObject({ code: 'validation' });
  });
});
