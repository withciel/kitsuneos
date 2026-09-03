import type { KitsuneEngine } from '@kitsuneos/core';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createStandardFixture,
  type Fixture,
  getEngine,
  seedAccount,
  seedOpportunity,
} from './fixtures.js';

describe('Console API surfaces (engine-backed)', () => {
  let engine: KitsuneEngine;
  let fixture: Fixture;
  let oppId: string;

  beforeAll(async () => {
    engine = await getEngine();
    fixture = await createStandardFixture(engine);
    const accountId = await seedAccount(engine, fixture, { name: 'ConsoleCo' });
    oppId = await seedOpportunity(engine, fixture, {
      account_id: accountId,
      name: 'Console Opp',
      stage: 'prospecting',
      amount: 50,
    });
  });

  it('schema browser masks fields the caller cannot read', async () => {
    const schema = await engine.describeSchema(
      fixture.workspaceId,
      fixture.readerId,
    );
    const opportunities = schema.collections.find(
      (collection) => collection.name === 'opportunities',
    );
    expect(opportunities?.fields.map((field) => field.name)).toEqual(
      expect.arrayContaining(['name', 'stage']),
    );
    expect(opportunities?.fields.map((field) => field.name)).not.toContain(
      'amount',
    );
    expect(
      schema.collections.map((collection) => collection.name),
    ).not.toContain('accounts');
  });

  it('query runner uses the compiler and omits masked fields', async () => {
    const rows = await engine.query(fixture.workspaceId, fixture.readerId, {
      collection: 'opportunities',
      fields: ['name', 'stage'],
    });
    expect(rows.some((row) => row.name === 'Console Opp')).toBe(true);
    await expect(
      engine.query(fixture.workspaceId, fixture.readerId, {
        collection: 'opportunities',
        fields: ['amount'],
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('audit search is not-found for a non-admin', async () => {
    await expect(
      engine.queryAudit(fixture.workspaceId, fixture.readerId, { limit: 10 }),
    ).rejects.toMatchObject({ code: 'not_found' });
    const adminRows = await engine.queryAudit(
      fixture.workspaceId,
      fixture.adminId,
      { limit: 10 },
    );
    expect(adminRows.length).toBeGreaterThan(0);
  });

  it('history is grant-filtered like live reads', async () => {
    const listed = await engine.listRecordRevisions(
      fixture.workspaceId,
      fixture.readerId,
      'opportunities',
      oppId,
      { limit: 10 },
    );
    expect(listed.revisions.length).toBeGreaterThan(0);
    const snapshot = await engine.readRecordAt(
      fixture.workspaceId,
      fixture.readerId,
      'opportunities',
      oppId,
      { revision: listed.revisions[0]?.revision },
    );
    expect(snapshot).not.toBeNull();
    expect(snapshot).not.toHaveProperty('amount');
  });

  it('listGrants hides other principals from non-admins', async () => {
    const readerGrants = await engine.listGrants(
      fixture.workspaceId,
      fixture.readerId,
    );
    expect(
      readerGrants.every((grant) => grant.principalId === fixture.readerId),
    ).toBe(true);
    const adminGrants = await engine.listGrants(
      fixture.workspaceId,
      fixture.adminId,
    );
    expect(adminGrants.length).toBeGreaterThan(readerGrants.length);
  });

  it('review apply is refused while any operation remains proposed', async () => {
    const cs = await engine.proposeChangeSet(
      fixture.workspaceId,
      fixture.agentId,
      {
        operations: [
          {
            collection: 'opportunities',
            recordId: oppId,
            op: 'update',
            fieldName: 'name',
            newValue: 'Partial',
          },
          {
            collection: 'opportunities',
            recordId: oppId,
            op: 'update',
            fieldName: 'stage',
            newValue: 'negotiation',
          },
        ],
      },
    );
    const [firstOp, secondOp] = cs.operationIds;
    expect(firstOp).toBeDefined();
    expect(secondOp).toBeDefined();

    await engine.reviewChangeSet(
      fixture.workspaceId,
      fixture.reviewerId,
      cs.changeSetId,
      [{ opId: firstOp as string, status: 'approved' }],
    );

    await expect(
      engine.applyChangeSet(
        fixture.workspaceId,
        fixture.reviewerId,
        cs.changeSetId,
      ),
    ).rejects.toMatchObject({ code: 'validation' });

    await engine.reviewChangeSet(
      fixture.workspaceId,
      fixture.reviewerId,
      cs.changeSetId,
      [{ opId: secondOp as string, status: 'rejected' }],
    );

    const result = await engine.applyChangeSet(
      fixture.workspaceId,
      fixture.reviewerId,
      cs.changeSetId,
    );
    expect(result.status).toBe('applied');
    const live = await engine.readRecord(
      fixture.workspaceId,
      fixture.adminId,
      'opportunities',
      oppId,
      ['name', 'stage'],
    );
    expect(live?.name).toBe('Partial');
    expect(live?.stage).toBe('prospecting');
  });
});
