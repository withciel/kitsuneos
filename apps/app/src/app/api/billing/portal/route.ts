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

    const customerId = await engine.getWorkspaceDodoCustomerId(ctx.workspaceId);
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
