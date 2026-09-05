// workspace-lint: ignore — workspace resolved via requireWorkspace(); SQL uses kitsune schema column names.
import { withAuth } from '@workos-inc/authkit-nextjs';
import { NextResponse } from 'next/server';
import { getDodoClient } from '@/lib/dodo';
import { requireWorkspace } from '@/lib/require-workspace';

export async function POST() {
  try {
    const ctx = await requireWorkspace();
    const client = getDodoClient();
    if (!client) {
      return NextResponse.json(
        { error: 'Billing not configured' },
        { status: 503 },
      );
    }

    const productId = process.env.DODO_PRODUCT_ID;
    if (!productId) {
      return NextResponse.json(
        { error: 'Billing product not configured' },
        { status: 503 },
      );
    }

    const { user } = await withAuth();
    const returnUrl = `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/?checkout=success`;
    const session = await client.checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: {
        email: user?.email ?? 'billing@kitsuneos.com',
        name: user?.firstName
          ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`
          : 'KitsuneOS customer',
      },
      return_url: returnUrl,
      metadata: { kitsune_workspace: ctx.workspaceId },
    });

    return NextResponse.json({ checkoutUrl: session.checkout_url });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
