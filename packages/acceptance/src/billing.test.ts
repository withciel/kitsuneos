import {
  assertWriteEntitlement,
  recordBillingEvent,
  statusGrantsWrite,
  upsertSubscription,
} from '@kitsuneos/core';
import { v4 as uuidv4 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStandardFixture, getEngine } from './fixtures.js';

describe('billing entitlement', () => {
  let engine: Awaited<ReturnType<typeof getEngine>>;
  let workspaceId: string;
  let adminId: string;

  beforeAll(async () => {
    engine = await getEngine();
    const fixture = await createStandardFixture(engine);
    workspaceId = fixture.workspaceId;
    adminId = fixture.adminId;
  });

  afterAll(async () => {
    await engine.close();
  });

  it('active and on_hold grant write access', () => {
    expect(statusGrantsWrite('active')).toBe(true);
    expect(statusGrantsWrite('on_hold')).toBe(true);
    expect(statusGrantsWrite('paused')).toBe(false);
    expect(statusGrantsWrite('expired')).toBe(false);
    expect(statusGrantsWrite('past_due')).toBe(false);
  });

  it('past_due blocks propose_change_set via entitlement check', async () => {
    await upsertSubscription(engine.ownerPool, {
      workspaceId,
      dodoSubscriptionId: `sub_test_${workspaceId}`,
      status: 'past_due',
    });
    await expect(
      assertWriteEntitlement(engine.ownerPool, workspaceId),
    ).rejects.toMatchObject({
      code: 'forbidden',
    });
    await engine.ownerPool.query(
      `DELETE FROM kitsune.subscriptions WHERE workspace_id = $1`,
      [workspaceId],
    );
  });

  it('past_due blocks directWrite', async () => {
    await upsertSubscription(engine.ownerPool, {
      workspaceId,
      dodoSubscriptionId: `sub_direct_${workspaceId}`,
      status: 'past_due',
    });
    await expect(
      engine.directWrite(workspaceId, adminId, 'accounts', {
        name: 'blocked write',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await engine.ownerPool.query(
      `DELETE FROM kitsune.subscriptions WHERE workspace_id = $1`,
      [workspaceId],
    );
  });

  it('billing webhook events are idempotent by event id', async () => {
    const eventId = `evt_test_${uuidv4()}`;
    const first = await recordBillingEvent(engine.ownerPool, eventId, {
      type: 'test',
    });
    const second = await recordBillingEvent(engine.ownerPool, eventId, {
      type: 'test',
    });
    expect(first).toBe(true);
    expect(second).toBe(false);
  });
});
