// workspace-lint: ignore — server-side billing reconciliation only.

import { upsertSubscription } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { getDodoClient } from '@/lib/dodo';
import { engine } from '@/lib/engine';

/** Reconcile Dodo subscription status against stored entitlements (~20 lines). */
export async function POST(request: Request) {
  const secret = request.headers.get('x-reconcile-secret');
  if (!secret || secret !== process.env.BILLING_RECONCILE_SECRET) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const client = getDodoClient();
  if (!client) {
    return NextResponse.json(
      { error: 'Billing not configured' },
      { status: 503 },
    );
  }

  const stored = await engine.ownerPool.query<{
    workspace_id: string;
    dodo_subscription_id: string;
    status: string;
  }>(
    `SELECT workspace_id, dodo_subscription_id, status FROM kitsune.subscriptions`,
  );

  let updated = 0;
  for (const row of stored.rows) {
    const live = await client.subscriptions.retrieve(row.dodo_subscription_id);
    const liveStatus = String(
      (live as { status?: string }).status ?? 'unknown',
    );
    if (liveStatus !== row.status) {
      await upsertSubscription(engine.ownerPool, {
        workspaceId: row.workspace_id,
        dodoSubscriptionId: row.dodo_subscription_id,
        status: liveStatus,
      });
      updated++;
    }
  }

  return NextResponse.json({ checked: stored.rowCount, updated });
}
