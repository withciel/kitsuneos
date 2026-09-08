// workspace-lint: ignore — server-side billing reconciliation only.

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

  const stored = await engine.listSubscriptions();

  let updated = 0;
  for (const row of stored) {
    const live = await client.subscriptions.retrieve(row.dodoSubscriptionId);
    const liveStatus = String(
      (live as { status?: string }).status ?? 'unknown',
    );
    if (liveStatus !== row.status) {
      await engine.upsertSubscription({
        workspaceId: row.workspaceId,
        dodoSubscriptionId: row.dodoSubscriptionId,
        status: liveStatus,
      });
      updated++;
    }
  }

  return NextResponse.json({ checked: stored.length, updated });
}
