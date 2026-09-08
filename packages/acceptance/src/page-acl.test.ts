import { randomUUID } from 'node:crypto';
import {
  canViewPage,
  filterVisibleRecordIds,
  upsertPageVisibility,
} from '@kitsuneos/core';
import { describe, expect, it } from 'vitest';
import {
  createStandardFixture,
  getEngine,
  seedAccount,
  seedOpportunity,
} from './fixtures.js';

describe('page ACL single authorization path', () => {
  it('canViewPage matches compileReadRecord / readRecord for private pages', async () => {
    const engine = await getEngine();
    const fresh = await createStandardFixture(engine);
    const accountId = await seedAccount(engine, fresh, {
      name: 'ACL Equivalence Co',
      industry: 'legal',
    });

    await upsertPageVisibility(engine.ownerPool, {
      workspaceId: fresh.workspaceId,
      collectionId: fresh.collections.accounts,
      recordId: accountId,
      visibility: 'private',
      ownerPrincipalId: fresh.adminId,
      actorPrincipalId: fresh.adminId,
    });

    const adminView = await canViewPage(engine.ownerPool, {
      workspaceId: fresh.workspaceId,
      collectionId: fresh.collections.accounts,
      recordId: accountId,
      principalId: fresh.adminId,
    });
    const reviewerView = await canViewPage(engine.ownerPool, {
      workspaceId: fresh.workspaceId,
      collectionId: fresh.collections.accounts,
      recordId: accountId,
      principalId: fresh.reviewerId,
    });
    expect(adminView).toBe(true);
    expect(reviewerView).toBe(false);

    const asAdmin = await engine.readRecord(
      fresh.workspaceId,
      fresh.adminId,
      'accounts',
      accountId,
    );
    const asReviewer = await engine.readRecord(
      fresh.workspaceId,
      fresh.reviewerId,
      'accounts',
      accountId,
    );
    expect(asAdmin).not.toBeNull();
    expect(asReviewer).toBeNull();
    expect(adminView).toBe(asAdmin !== null);
    expect(reviewerView).toBe(asReviewer !== null);

    const filtered = await filterVisibleRecordIds(engine.ownerPool, {
      workspaceId: fresh.workspaceId,
      collectionId: fresh.collections.accounts,
      recordIds: [accountId],
      principalId: fresh.reviewerId,
    });
    expect(filtered).toEqual([]);
  });

  it('proposeChangeSet returns not-found for a private page outside page ACL', async () => {
    const engine = await getEngine();
    const fresh = await createStandardFixture(engine);
    const accountId = await seedAccount(engine, fresh, {
      name: 'Propose Private Co',
      industry: 'security',
    });
    const oppId = await seedOpportunity(engine, fresh, {
      account_id: accountId,
      name: 'Hidden Deal',
      amount: 42,
      stage: 'prospecting',
      next_step: 'Do not propose against me',
    });

    await upsertPageVisibility(engine.ownerPool, {
      workspaceId: fresh.workspaceId,
      collectionId: fresh.collections.opportunities,
      recordId: oppId,
      visibility: 'private',
      ownerPrincipalId: fresh.adminId,
      actorPrincipalId: fresh.adminId,
    });

    await expect(
      engine.proposeChangeSet(fresh.workspaceId, fresh.reviewerId, {
        operations: [
          {
            collection: 'opportunities',
            recordId: oppId,
            op: 'update',
            fieldName: 'next_step',
            newValue: 'leaked',
          },
        ],
      }),
    ).rejects.toMatchObject({
      message: 'Not found',
      code: 'not_found',
    });

    const proposed = await engine.proposeChangeSet(
      fresh.workspaceId,
      fresh.adminId,
      {
        operations: [
          {
            collection: 'opportunities',
            recordId: oppId,
            op: 'update',
            fieldName: 'next_step',
            newValue: 'owner ok',
          },
        ],
      },
    );
    expect(typeof proposed.changeSetId).toBe('string');
  });

  it('listWikiLinkEdges excludes private endpoints for non-shared principals', async () => {
    const engine = await getEngine();
    const fresh = await createStandardFixture(engine);
    const publicId = await seedAccount(engine, fresh, {
      name: 'Public Wiki Node',
      industry: 'media',
    });
    const privateId = await seedAccount(engine, fresh, {
      name: 'Private Wiki Node',
      industry: 'defense',
    });

    await upsertPageVisibility(engine.ownerPool, {
      workspaceId: fresh.workspaceId,
      collectionId: fresh.collections.accounts,
      recordId: privateId,
      visibility: 'private',
      ownerPrincipalId: fresh.adminId,
      actorPrincipalId: fresh.adminId,
    });

    await engine.ownerPool.query(
      `INSERT INTO kitsune.page_links
         (id, workspace_id, from_collection_id, from_record_id,
          to_collection_id, to_record_id, raw_target, created_at)
       VALUES ($1, $2, $3, $4, $3, $5, $6, now())`,
      [
        randomUUID(),
        fresh.workspaceId,
        fresh.collections.accounts,
        publicId,
        privateId,
        'Private Wiki Node',
      ],
    );

    const asAdmin = await engine.listWikiLinkEdges(
      fresh.workspaceId,
      fresh.adminId,
    );
    expect(
      asAdmin.some(
        (e) => e.fromRecordId === publicId && e.toRecordId === privateId,
      ),
    ).toBe(true);

    const asReviewer = await engine.listWikiLinkEdges(
      fresh.workspaceId,
      fresh.reviewerId,
    );
    expect(
      asReviewer.some(
        (e) => e.fromRecordId === publicId && e.toRecordId === privateId,
      ),
    ).toBe(false);
  });
});
