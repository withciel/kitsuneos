import type { Pool } from 'pg';
import { KitsuneError } from '../types.js';

/** Dodo subscription statuses mapped to workspace write access. */
export type SubscriptionStatus =
  | 'pending'
  | 'active'
  | 'on_hold'
  | 'paused'
  | 'cancelled'
  | 'failed'
  | 'expired'
  | 'past_due';

const WRITE_STATUSES = new Set<SubscriptionStatus>(['active', 'on_hold']);

export function statusGrantsWrite(
  status: SubscriptionStatus | null | undefined,
): boolean {
  if (!status) {
    return true;
  }
  return WRITE_STATUSES.has(status);
}

export async function loadWorkspaceSubscriptionStatus(
  pool: Pool,
  workspaceId: string,
): Promise<SubscriptionStatus | null> {
  const result = await pool.query<{ status: SubscriptionStatus }>(
    `SELECT status FROM kitsune.subscriptions
      WHERE workspace_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [workspaceId],
  );
  return result.rows[0]?.status ?? null;
}

export async function assertWriteEntitlement(
  pool: Pool,
  workspaceId: string,
  portalUrl = '/api/billing/portal',
): Promise<void> {
  const status = await loadWorkspaceSubscriptionStatus(pool, workspaceId);
  if (statusGrantsWrite(status)) {
    return;
  }
  throw new KitsuneError(
    `Write access suspended (${status ?? 'unknown'}). Update billing: ${portalUrl}`,
    'forbidden',
    { billingStatus: status, portalUrl },
  );
}
