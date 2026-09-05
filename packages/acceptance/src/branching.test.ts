import type { KitsuneEngine } from '@kitsuneos/core';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createStandardFixture,
  type Fixture,
  getEngine,
  seedAccount,
} from './fixtures.js';

describe('R15 schema-level workspace branching', () => {
  let engine: KitsuneEngine;
  let fixture: Fixture;

  beforeAll(async () => {
    engine = await getEngine();
    fixture = await createStandardFixture(engine);
  });

  it('copies schema and data into an isolated branch workspace', async () => {
    const accountId = await seedAccount(engine, fixture, {
      name: 'BranchSourceCo',
      industry: 'software',
    });

    const branch = await engine.createBranch(
      fixture.workspaceId,
      fixture.adminId,
      { name: 'staging' },
    );
    expect(branch.parentWorkspaceId).toBe(fixture.workspaceId);
    expect(branch.branchName).toBe('staging');
    expect(branch.schemaName).not.toBe(fixture.schemaName);

    const branches = await engine.listBranches(
      fixture.workspaceId,
      fixture.adminId,
    );
    expect(branches.some((b) => b.workspaceId === branch.workspaceId)).toBe(
      true,
    );

    // createBranch remaps principals; find the branch admin by display name.
    const branchAdmin = await engine.ownerPool.query<{ id: string }>(
      `SELECT id FROM kitsune.principals
        WHERE workspace_id = $1 AND display_name = 'Admin'
        LIMIT 1`,
      [branch.workspaceId],
    );
    const branchAdminId = branchAdmin.rows[0]?.id;
    expect(branchAdminId).toBeTruthy();

    const branchReviewer = await engine.ownerPool.query<{ id: string }>(
      `SELECT id FROM kitsune.principals
        WHERE workspace_id = $1 AND display_name = 'Reviewer'
        LIMIT 1`,
      [branch.workspaceId],
    );
    const branchReviewerId = branchReviewer.rows[0]?.id;
    expect(branchReviewerId).toBeTruthy();

    const copied = await engine.readRecord(
      branch.workspaceId,
      branchAdminId!,
      'accounts',
      accountId,
      ['name', 'industry'],
    );
    expect(copied?.name).toBe('BranchSourceCo');
    expect(copied?.industry).toBe('software');

    // Mutate branch via change set; source stays unchanged.
    const proposed = await engine.proposeChangeSet(
      branch.workspaceId,
      branchAdminId!,
      {
        operations: [
          {
            collection: 'accounts',
            recordId: accountId,
            op: 'update',
            fieldName: 'name',
            newValue: 'BranchMutated',
          },
        ],
      },
    );
    await engine.reviewChangeSet(
      branch.workspaceId,
      branchReviewerId!,
      proposed.changeSetId,
      proposed.operationIds.map((opId) => ({
        opId,
        status: 'approved' as const,
      })),
    );
    const applied = await engine.applyChangeSet(
      branch.workspaceId,
      branchReviewerId!,
      proposed.changeSetId,
    );
    expect(applied.status).toBe('applied');

    const sourceAfter = await engine.readRecord(
      fixture.workspaceId,
      fixture.adminId,
      'accounts',
      accountId,
      ['name'],
    );
    expect(sourceAfter?.name).toBe('BranchSourceCo');

    const branchAfter = await engine.readRecord(
      branch.workspaceId,
      branchAdminId!,
      'accounts',
      accountId,
      ['name'],
    );
    expect(branchAfter?.name).toBe('BranchMutated');
  });

  it('rejects duplicate branch names and non-admins', async () => {
    await engine.createBranch(fixture.workspaceId, fixture.adminId, {
      name: 'dup-check',
    });
    await expect(
      engine.createBranch(fixture.workspaceId, fixture.adminId, {
        name: 'dup-check',
      }),
    ).rejects.toThrow();

    await expect(
      engine.createBranch(fixture.workspaceId, fixture.readerId, {
        name: 'reader-branch',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
