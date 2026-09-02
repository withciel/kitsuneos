// workspace-lint: ignore — workspace resolved via requireWorkspace(); SQL uses kitsune schema column names.
import { NextResponse } from 'next/server';
import { getDodoClient } from '@/lib/dodo';
import { engine } from '@/lib/engine';
import { requireWorkspace } from '@/lib/require-workspace';

export async function GET() {
  try {
    const ctx = await requireWorkspace();
    const client = getDodoClient();
    if (!client) {
      return NextResponse.json(
        { error: 'Billing not configured' },
        { status: 503 },
      );
    }

    const sub = await engine.ownerPool.query<{
      dodo_customer_id: string | null;
    }>(
      `SELECT dodo_customer_id FROM kitsune.subscriptions
        WHERE workspace_id = $1 AND dodo_customer_id IS NOT NULL
        ORDER BY created_at DESC LIMIT 1`,
      [ctx.workspaceId],
    );
    const customerId = sub.rows[0]?.dodo_customer_id;
    if (!customerId) {
      return NextResponse.json(
        { error: 'No subscription yet. Start checkout first.' },
        { status: 404 },
      );
    }

    const portal = await client.customers.customerPortal.create(customerId);

    return NextResponse.redirect(portal.link);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
