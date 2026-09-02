import type { Pool, PoolClient } from 'pg';

export async function recordUsageEvent(
  pool: Pool,
  workspaceId: string,
  kind: string,
  count = 1,
): Promise<void> {
  await pool.query(
    `INSERT INTO kitsune.usage_events (workspace_id, kind, count) VALUES ($1, $2, $3)`,
    [workspaceId, kind, count],
  );
}

export async function upsertSubscription(
  pool: Pool,
  input: {
    workspaceId: string;
    dodoSubscriptionId: string;
    dodoCustomerId?: string | null;
    status: string;
    lastWebhookAt?: Date | null;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO kitsune.subscriptions
       (id, workspace_id, dodo_subscription_id, dodo_customer_id, status, last_webhook_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
     ON CONFLICT (dodo_subscription_id) DO UPDATE SET
       status = EXCLUDED.status,
       dodo_customer_id = COALESCE(EXCLUDED.dodo_customer_id, kitsune.subscriptions.dodo_customer_id),
       updated_at = now(),
       last_webhook_at = COALESCE(EXCLUDED.last_webhook_at, kitsune.subscriptions.last_webhook_at)`,
    [
      input.workspaceId,
      input.dodoSubscriptionId,
      input.dodoCustomerId ?? null,
      input.status,
      input.lastWebhookAt ?? null,
    ],
  );
}

export async function recordBillingEvent(
  pool: Pool,
  eventId: string,
  payload: unknown,
): Promise<boolean> {
  const result = await pool.query(
    `INSERT INTO kitsune.billing_events (event_id, payload)
     VALUES ($1, $2)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING event_id`,
    [eventId, JSON.stringify(payload)],
  );
  return result.rows.length > 0;
}

export async function findWorkspaceByDodoCustomer(
  pool: Pool,
  customerId: string,
): Promise<string | null> {
  const result = await pool.query<{ workspace_id: string }>(
    `SELECT workspace_id FROM kitsune.subscriptions
      WHERE dodo_customer_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [customerId],
  );
  return result.rows[0]?.workspace_id ?? null;
}

export type SubscriptionWebhookResult =
  | 'processed'
  | 'duplicate'
  | 'ignored'
  | 'stale';

export interface ProcessSubscriptionWebhookInput {
  eventId: string;
  payload: unknown;
  workspaceId: string | null;
  dodoSubscriptionId: string | null;
  dodoCustomerId: string | null;
  status: string;
  webhookAt: Date;
}

async function upsertSubscriptionInTxn(
  client: PoolClient,
  input: Omit<ProcessSubscriptionWebhookInput, 'eventId' | 'payload'>,
): Promise<'processed' | 'stale'> {
  const result = await client.query(
    `INSERT INTO kitsune.subscriptions
       (id, workspace_id, dodo_subscription_id, dodo_customer_id, status, last_webhook_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
     ON CONFLICT (dodo_subscription_id) DO UPDATE SET
       status = EXCLUDED.status,
       dodo_customer_id = COALESCE(EXCLUDED.dodo_customer_id, kitsune.subscriptions.dodo_customer_id),
       updated_at = now(),
       last_webhook_at = EXCLUDED.last_webhook_at
     WHERE kitsune.subscriptions.last_webhook_at IS NULL
        OR kitsune.subscriptions.last_webhook_at <= EXCLUDED.last_webhook_at
     RETURNING id`,
    [
      input.workspaceId,
      input.dodoSubscriptionId,
      input.dodoCustomerId,
      input.status,
      input.webhookAt,
    ],
  );
  return result.rows.length > 0 ? 'processed' : 'stale';
}

/** Atomically dedupe, resolve workspace, and persist subscription state. */
export async function processSubscriptionWebhook(
  pool: Pool,
  input: ProcessSubscriptionWebhookInput,
): Promise<SubscriptionWebhookResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const eventInsert = await client.query(
      `INSERT INTO kitsune.billing_events (event_id, payload)
       VALUES ($1, $2)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [input.eventId, JSON.stringify(input.payload)],
    );
    if (eventInsert.rows.length === 0) {
      await client.query('ROLLBACK');
      return 'duplicate';
    }

    if (!input.workspaceId || !input.dodoSubscriptionId) {
      await client.query('ROLLBACK');
      return 'ignored';
    }

    const outcome = await upsertSubscriptionInTxn(client, {
      workspaceId: input.workspaceId,
      dodoSubscriptionId: input.dodoSubscriptionId,
      dodoCustomerId: input.dodoCustomerId,
      status: input.status,
      webhookAt: input.webhookAt,
    });

    await client.query('COMMIT');
    return outcome;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
