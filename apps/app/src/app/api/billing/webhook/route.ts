// workspace-lint: ignore — webhook metadata maps Dodo customer to provisioned workspace.
import {
  findWorkspaceByDodoCustomer,
  processSubscriptionWebhook,
  recordBillingEvent,
} from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';
import { mapDodoSubscriptionStatus } from '@/lib/dodo';
import { engine } from '@/lib/engine';

function parseWebhookEvent(verified: unknown): {
  type: string;
  data: Record<string, unknown>;
} {
  if (typeof verified !== 'object' || verified === null) {
    throw new Error('Invalid webhook payload');
  }
  const event = verified as { type?: unknown; data?: unknown };
  if (
    typeof event.type !== 'string' ||
    typeof event.data !== 'object' ||
    event.data === null
  ) {
    throw new Error('Invalid webhook event shape');
  }
  return { type: event.type, data: event.data as Record<string, unknown> };
}

export async function POST(request: Request) {
  const webhookKey = process.env.DODO_PAYMENTS_WEBHOOK_KEY;
  if (!webhookKey) {
    return NextResponse.json(
      { error: 'Webhook key not configured' },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const webhookId = request.headers.get('webhook-id') ?? '';
  const webhookSignature = request.headers.get('webhook-signature') ?? '';
  const webhookTimestamp = request.headers.get('webhook-timestamp') ?? '';

  let event: { type: string; data: Record<string, unknown> };
  try {
    const verifier = new Webhook(webhookKey);
    const verified = verifier.verify(rawBody, {
      'webhook-id': webhookId,
      'webhook-signature': webhookSignature,
      'webhook-timestamp': webhookTimestamp,
    });
    event = parseWebhookEvent(verified);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const eventId =
    webhookId || `${event.type}:${JSON.stringify(event.data).slice(0, 64)}`;

  if (!event.type.startsWith('subscription.')) {
    const isNew = await recordBillingEvent(engine.ownerPool, eventId, event);
    return NextResponse.json({
      received: true,
      duplicate: !isNew,
      ignored: true,
    });
  }

  const subscription = event.data as {
    subscription_id?: string;
    customer_id?: string;
    status?: string;
    metadata?: { kitsune_workspace?: string; workspace_id?: string };
  };

  const status = mapDodoSubscriptionStatus(event.type, subscription.status);

  let workspaceId =
    subscription.metadata?.kitsune_workspace ??
    subscription.metadata?.workspace_id ??
    null;
  if (!workspaceId && subscription.customer_id) {
    workspaceId = await findWorkspaceByDodoCustomer(
      engine.ownerPool,
      subscription.customer_id,
    );
  }

  const webhookAt = new Date(
    webhookTimestamp && !Number.isNaN(Number(webhookTimestamp))
      ? Number(webhookTimestamp) * 1000
      : Date.now(),
  );

  const result = await processSubscriptionWebhook(engine.ownerPool, {
    eventId,
    payload: event,
    workspaceId,
    dodoSubscriptionId: subscription.subscription_id ?? null,
    dodoCustomerId: subscription.customer_id ?? null,
    status,
    webhookAt,
  });

  return NextResponse.json({ received: true, result });
}
