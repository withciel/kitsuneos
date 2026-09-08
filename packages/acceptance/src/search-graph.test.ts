import { upsertPageVisibility } from '@kitsuneos/core';
import { createMcpHandlers } from '@kitsuneos/mcp';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createStandardFixture,
  type Fixture,
  getEngine,
  seedAccount,
  seedOpportunity,
} from './fixtures.js';

describe('semantic search + reference graph (R9)', () => {
  let fixture: Fixture;
  let engine: Awaited<ReturnType<typeof getEngine>>;

  afterAll(async () => {
    // shared engine lives for the suite process
  });

  it('boots a fixture with prose and indexes embeddings', async () => {
    engine = await getEngine();
    fixture = await createStandardFixture(engine);
    const accountId = await seedAccount(engine, fixture, {
      name: 'Acme',
      industry: 'technology',
    });
    await seedOpportunity(engine, fixture, {
      account_id: accountId,
      name: 'Big Deal',
      amount: 10000,
      stage: 'prospecting',
      next_step: 'Schedule a deep dive on vector search grants',
    });
    await seedOpportunity(engine, fixture, {
      account_id: accountId,
      name: 'Secret Win',
      amount: 50000,
      stage: 'closed_won',
      next_step: 'Celebrate the closed won revenue event quietly',
    });
  });

  it('admin search finds prose by meaning', async () => {
    const result = await engine.search(fixture.workspaceId, fixture.adminId, {
      query: 'vector search grants',
      collections: ['opportunities'],
      limit: 10,
    });
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.hits[0]?.collection).toBe('opportunities');
    expect(result.hits[0]?.fieldName).toBe('next_step');
    expect(result.hits[0]?.excerpt.toLowerCase()).toContain('vector');
  });

  it('masked field never appears in search excerpts', async () => {
    // reader grant: opportunities read mask ['name','stage'] — no next_step
    const result = await engine.search(fixture.workspaceId, fixture.readerId, {
      query: 'vector search grants',
      collections: ['opportunities'],
    });
    expect(result.hits.every((h) => h.fieldName !== 'next_step')).toBe(true);
    expect(
      result.hits.every((h) => !h.excerpt.toLowerCase().includes('vector')),
    ).toBe(true);
  });

  it('denied collection is absent from search', async () => {
    // reader has no accounts grant
    const result = await engine.search(fixture.workspaceId, fixture.readerId, {
      query: 'Acme',
      collections: ['accounts'],
    });
    expect(result.hits).toEqual([]);
  });

  it('row predicate excludes denied rows from search', async () => {
    // predicateAgent cannot see closed_won
    const result = await engine.search(
      fixture.workspaceId,
      fixture.predicateAgentId,
      {
        query: 'closed won revenue',
        collections: ['opportunities'],
      },
    );
    for (const hit of result.hits) {
      const row = await engine.readRecord(
        fixture.workspaceId,
        fixture.predicateAgentId,
        'opportunities',
        hit.recordId,
        ['stage', 'name'],
      );
      expect(row).not.toBeNull();
      expect(row?.stage).not.toBe('closed_won');
    }
  });

  it('revoke takes effect on the next search', async () => {
    const before = await engine.search(fixture.workspaceId, fixture.agentId, {
      query: 'vector search',
      collections: ['opportunities'],
    });
    expect(before.hits.length).toBeGreaterThan(0);

    const grants = await engine.listGrants(
      fixture.workspaceId,
      fixture.adminId,
    );
    const agentOppGrant = grants.find(
      (g) =>
        g.principalId === fixture.agentId &&
        g.collection === 'opportunities' &&
        g.revokedAt === null,
    );
    expect(agentOppGrant).toBeTruthy();
    await engine.revokeGrant(
      agentOppGrant!.id,
      fixture.adminId,
      fixture.workspaceId,
    );

    const after = await engine.search(fixture.workspaceId, fixture.agentId, {
      query: 'vector search',
      collections: ['opportunities'],
    });
    expect(after.hits).toEqual([]);
  });

  it('listRelated returns outgoing and incoming neighbors under grants', async () => {
    const fresh = await createStandardFixture(engine);
    const accountId = await seedAccount(engine, fresh, {
      name: 'Globex',
      industry: 'manufacturing',
    });
    const oppId = await seedOpportunity(engine, fresh, {
      account_id: accountId,
      name: 'Factory line',
      amount: 1,
      stage: 'negotiation',
      next_step: 'Tour the plant floor',
    });

    const related = await engine.listRelated(
      fresh.workspaceId,
      fresh.adminId,
      'opportunities',
      oppId,
    );
    expect(related.outgoing.some((n) => n.recordId === accountId)).toBe(true);
    expect(related.outgoing[0]?.label).toBe('Globex');

    const fromAccount = await engine.listRelated(
      fresh.workspaceId,
      fresh.adminId,
      'accounts',
      accountId,
    );
    expect(fromAccount.incoming.some((n) => n.recordId === oppId)).toBe(true);
  });

  it('listRelated never surfaces a private neighbor id to a non-shared principal', async () => {
    // reviewerId has an unrestricted collection-level write grant on both
    // accounts and opportunities, so a leak here can only come from the
    // page_access compiled predicate — not the grant/field-mask layer.
    const fresh = await createStandardFixture(engine);
    const accountId = await seedAccount(engine, fresh, {
      name: 'Confidential Corp',
      industry: 'finance',
    });
    const oppId = await seedOpportunity(engine, fresh, {
      account_id: accountId,
      name: 'Private Renewal',
      amount: 5,
      stage: 'negotiation',
      next_step: 'Keep this account under wraps',
    });

    await upsertPageVisibility(engine.ownerPool, {
      workspaceId: fresh.workspaceId,
      collectionId: fresh.collections.accounts,
      recordId: accountId,
      visibility: 'private',
      ownerPrincipalId: fresh.adminId,
      actorPrincipalId: fresh.adminId,
    });

    // A second, private opportunity referencing the same (public) account,
    // used below to exercise the incoming-neighbor direction.
    const otherAccountId = await seedAccount(engine, fresh, {
      name: 'Public Co',
      industry: 'retail',
    });
    const privateOppId = await seedOpportunity(engine, fresh, {
      account_id: otherAccountId,
      name: 'Private Pipeline Item',
      amount: 9,
      stage: 'negotiation',
      next_step: 'Do not disclose',
    });
    await upsertPageVisibility(engine.ownerPool, {
      workspaceId: fresh.workspaceId,
      collectionId: fresh.collections.opportunities,
      recordId: privateOppId,
      visibility: 'private',
      ownerPrincipalId: fresh.adminId,
      actorPrincipalId: fresh.adminId,
    });

    // Owner/admin still sees the private neighbor.
    const asAdmin = await engine.listRelated(
      fresh.workspaceId,
      fresh.adminId,
      'opportunities',
      oppId,
    );
    expect(asAdmin.outgoing.some((n) => n.recordId === accountId)).toBe(true);

    // reviewerId has grant-level read/write on accounts but no page share on
    // this specific private page: the record id must be absent, not just
    // inaccessible via a 403 — the neighbor row (and its label) must never
    // have been selected in the first place.
    const asReviewer = await engine.listRelated(
      fresh.workspaceId,
      fresh.reviewerId,
      'opportunities',
      oppId,
    );
    expect(asReviewer.outgoing.some((n) => n.recordId === accountId)).toBe(
      false,
    );

    // Same assertion in the reverse (incoming) direction: the public
    // otherAccountId's incoming edges must exclude the private opportunity
    // that references it.
    const fromOtherAccountAsReviewer = await engine.listRelated(
      fresh.workspaceId,
      fresh.reviewerId,
      'accounts',
      otherAccountId,
    );
    expect(
      fromOtherAccountAsReviewer.incoming.some(
        (n) => n.recordId === privateOppId,
      ),
    ).toBe(false);

    const fromOtherAccountAsAdmin = await engine.listRelated(
      fresh.workspaceId,
      fresh.adminId,
      'accounts',
      otherAccountId,
    );
    expect(
      fromOtherAccountAsAdmin.incoming.some((n) => n.recordId === privateOppId),
    ).toBe(true);
  });

  it('listRelated returns not-found for a private root the principal cannot view', async () => {
    // Collection grant alone must not leak neighbors of a private root.
    const fresh = await createStandardFixture(engine);
    const accountId = await seedAccount(engine, fresh, {
      name: 'Hidden Root Co',
      industry: 'defense',
    });
    await seedOpportunity(engine, fresh, {
      account_id: accountId,
      name: 'Public Pipeline Off Hidden Root',
      amount: 3,
      stage: 'prospecting',
      next_step: 'Should not be listable via private root',
    });
    await upsertPageVisibility(engine.ownerPool, {
      workspaceId: fresh.workspaceId,
      collectionId: fresh.collections.accounts,
      recordId: accountId,
      visibility: 'private',
      ownerPrincipalId: fresh.adminId,
      actorPrincipalId: fresh.adminId,
    });

    await expect(
      engine.listRelated(
        fresh.workspaceId,
        fresh.reviewerId,
        'accounts',
        accountId,
      ),
    ).rejects.toMatchObject({ message: 'Not found', code: 'not_found' });

    // Owner still walks the private root and sees public neighbors.
    const asAdmin = await engine.listRelated(
      fresh.workspaceId,
      fresh.adminId,
      'accounts',
      accountId,
    );
    expect(asAdmin.incoming.length).toBeGreaterThan(0);
  });

  it('MCP search and read_related tools honor grants', async () => {
    const fresh = await createStandardFixture(engine);
    const accountId = await seedAccount(engine, fresh, {
      name: 'Initech',
      industry: 'software',
    });
    await seedOpportunity(engine, fresh, {
      account_id: accountId,
      name: 'TPS',
      amount: 2,
      stage: 'prospecting',
      next_step: 'Cover sheets for the TPS reports',
    });

    const adminHandlers = createMcpHandlers(engine, () => ({
      workspaceId: fresh.workspaceId,
      principalId: fresh.adminId,
    }));
    const adminHits = await adminHandlers.search({
      query: 'TPS reports',
      collections: ['opportunities'],
    });
    expect(adminHits.hits.length).toBeGreaterThan(0);

    const readerHandlers = createMcpHandlers(engine, () => ({
      workspaceId: fresh.workspaceId,
      principalId: fresh.readerId,
    }));
    const readerHits = await readerHandlers.search({
      query: 'TPS reports',
      collections: ['opportunities'],
    });
    expect(readerHits.hits.every((h) => h.fieldName !== 'next_step')).toBe(
      true,
    );

    const related = await adminHandlers.read_related({
      collection: 'opportunities',
      recordId: adminHits.hits[0]!.recordId,
    });
    expect(related.outgoing.some((n) => n.collection === 'accounts')).toBe(
      true,
    );
  });
});
