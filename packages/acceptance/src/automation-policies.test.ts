import type { KitsuneEngine } from '@kitsuneos/core';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createStandardFixture,
  type Fixture,
  getEngine,
  seedAccount,
} from './fixtures.js';

describe('R11 change-set automation policies', () => {
  let engine: KitsuneEngine;
  let fixture: Fixture;

  beforeAll(async () => {
    engine = await getEngine();
    fixture = await createStandardFixture(engine);
  });

  it('auto-applies when confidence and field allowlist match', async () => {
    await engine.upsertAutomationPolicy(fixture.workspaceId, fixture.adminId, {
      name: 'auto-name-edits',
      kind: 'auto_apply',
      config: {
        allowedFields: ['name'],
        collections: ['accounts'],
        minConfidence: 0.9,
      },
    });

    const accountId = await seedAccount(engine, fixture, {
      name: 'AutoApplyCo',
    });

    const proposed = await engine.proposeChangeSet(
      fixture.workspaceId,
      fixture.adminId,
      {
        confidence: 0.95,
        operations: [
          {
            collection: 'accounts',
            recordId: accountId,
            op: 'update',
            fieldName: 'name',
            newValue: 'AutoApplied',
          },
        ],
      },
    );

    const status = await engine.ownerPool.query<{ status: string }>(
      `SELECT status FROM kitsune.change_sets WHERE id = $1`,
      [proposed.changeSetId],
    );
    expect(status.rows[0]?.status).toBe('applied');

    const row = await engine.readRecord(
      fixture.workspaceId,
      fixture.adminId,
      'accounts',
      accountId,
      ['name'],
    );
    expect(row?.name).toBe('AutoApplied');
  });

  it('requires multiple approvals when min_approvals policy matches', async () => {
    await engine.upsertAutomationPolicy(fixture.workspaceId, fixture.adminId, {
      name: 'dual-control-industry',
      kind: 'min_approvals',
      config: {
        minApprovals: 2,
        collections: ['accounts'],
        fields: ['industry'],
      },
    });

    const accountId = await seedAccount(engine, fixture, {
      name: 'DualControlCo',
      industry: 'software',
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
            fieldName: 'industry',
            newValue: 'finance',
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

    await expect(
      engine.applyChangeSet(
        fixture.workspaceId,
        fixture.reviewerId,
        proposed.changeSetId,
      ),
    ).rejects.toMatchObject({ code: 'validation' });

    // Second distinct approval from admin, then apply succeeds.
    await engine.reviewChangeSet(
      fixture.workspaceId,
      fixture.adminId,
      proposed.changeSetId,
      proposed.operationIds.map((opId) => ({
        opId,
        status: 'approved' as const,
      })),
    );

    const applied = await engine.applyChangeSet(
      fixture.workspaceId,
      fixture.adminId,
      proposed.changeSetId,
    );
    expect(applied.status).toBe('applied');

    const row = await engine.readRecord(
      fixture.workspaceId,
      fixture.adminId,
      'accounts',
      accountId,
      ['industry'],
    );
    expect(row?.industry).toBe('finance');
  });
});
