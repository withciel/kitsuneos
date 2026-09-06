import {
  assertPlanLimit,
  FREE_PLAN_LIMITS,
  planIdFromSubscriptionStatus,
  upsertSubscription,
} from '@kitsuneos/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStandardFixture, getEngine } from './fixtures.js';

describe('free plan limits', () => {
  let engine: Awaited<ReturnType<typeof getEngine>>;
  let workspaceId: string;

  beforeAll(async () => {
    engine = await getEngine();
    const fixture = await createStandardFixture(engine, { plan: 'free' });
    workspaceId = fixture.workspaceId;
  });

  afterAll(async () => {
    await engine.close();
  });

  it('maps subscription status to free vs pro', () => {
    expect(planIdFromSubscriptionStatus(null)).toBe('free');
    expect(planIdFromSubscriptionStatus('active')).toBe('pro');
    expect(planIdFromSubscriptionStatus('on_hold')).toBe('pro');
    expect(planIdFromSubscriptionStatus('past_due')).toBe('free');
  });

  it('enforces agent caps on free and lifts them when Pro is active', async () => {
    const current = await engine.ownerPool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM kitsune.principals
        WHERE workspace_id = $1 AND kind = 'agent' AND disabled_at IS NULL`,
      [workspaceId],
    );
    let agents = Number(current.rows[0]?.n ?? 0);
    while (agents < FREE_PLAN_LIMITS.agentsPerWorkspace) {
      await engine.createPrincipal(
        workspaceId,
        'agent',
        `limit-agent-${agents}`,
      );
      agents += 1;
    }

    await expect(
      assertPlanLimit(engine.ownerPool, {
        workspaceId,
        dimension: 'agentsPerWorkspace',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });

    await upsertSubscription(engine.ownerPool, {
      workspaceId,
      dodoSubscriptionId: `sub_pro_${workspaceId}`,
      status: 'active',
    });

    await expect(
      assertPlanLimit(engine.ownerPool, {
        workspaceId,
        dimension: 'agentsPerWorkspace',
      }),
    ).resolves.toBeUndefined();

    await engine.ownerPool.query(
      `DELETE FROM kitsune.subscriptions WHERE workspace_id = $1`,
      [workspaceId],
    );
  });
});
