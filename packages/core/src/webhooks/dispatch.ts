import { createHmac, randomBytes } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { KitsuneError } from '../types.js';

export interface WebhookEndpoint {
  id: string;
  workspaceId: string;
  url: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
}

export interface WebhookDelivery {
  id: string;
  endpointId: string;
  eventType: string;
  status: 'pending' | 'delivered' | 'failed';
  attemptCount: number;
  lastError: string | null;
}

export function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}

export function signWebhookPayload(
  secret: string,
  timestamp: string,
  body: string,
): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
}

export async function insertWebhookEndpoint(
  client: PoolClient,
  input: {
    id: string;
    workspaceId: string;
    url: string;
    secret: string;
    events: string[];
  },
): Promise<void> {
  if (!/^https?:\/\//i.test(input.url)) {
    throw new KitsuneError('Webhook URL must be http(s)', 'validation');
  }
  if (input.events.length === 0) {
    throw new KitsuneError('Webhook events required', 'validation');
  }
  await client.query(
    `INSERT INTO kitsune.webhook_endpoints
       (id, workspace_id, url, secret, events, enabled)
     VALUES ($1, $2, $3, $4, $5, true)`,
    [input.id, input.workspaceId, input.url, input.secret, input.events],
  );
}

export async function listWebhookEndpoints(
  client: PoolClient,
  workspaceId: string,
): Promise<WebhookEndpoint[]> {
  const result = await client.query<{
    id: string;
    workspace_id: string;
    url: string;
    events: string[];
    enabled: boolean;
    created_at: Date;
  }>(
    `SELECT id, workspace_id, url, events, enabled, created_at
       FROM kitsune.webhook_endpoints
      WHERE workspace_id = $1
      ORDER BY created_at`,
    [workspaceId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    url: row.url,
    events: row.events,
    enabled: row.enabled,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function deleteWebhookEndpoint(
  client: PoolClient,
  workspaceId: string,
  endpointId: string,
): Promise<boolean> {
  const result = await client.query(
    `DELETE FROM kitsune.webhook_endpoints
      WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, endpointId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function dispatchChangeSetApplied(
  pool: Pool,
  input: {
    workspaceId: string;
    changeSetId: string;
    authorId: string;
    appliedBy: string;
    operations: Array<{
      collection: string;
      recordId: string | null;
      op: string;
      fieldName: string | null;
    }>;
    fetchImpl?: typeof fetch;
  },
): Promise<WebhookDelivery[]> {
  const client = await pool.connect();
  const deliveries: WebhookDelivery[] = [];
  try {
    const endpoints = await client.query<{
      id: string;
      url: string;
      secret: string;
      events: string[];
    }>(
      `SELECT id, url, secret, events
         FROM kitsune.webhook_endpoints
        WHERE workspace_id = $1
          AND enabled = true
          AND 'change_set.applied' = ANY(events)`,
      [input.workspaceId],
    );
    if (endpoints.rows.length === 0) {
      return [];
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({
      type: 'change_set.applied',
      workspaceId: input.workspaceId,
      changeSetId: input.changeSetId,
      authorId: input.authorId,
      appliedBy: input.appliedBy,
      operations: input.operations,
      occurredAt: new Date().toISOString(),
    });

    const fetchFn = input.fetchImpl ?? globalThis.fetch.bind(globalThis);

    for (const endpoint of endpoints.rows) {
      const deliveryId = uuidv4();
      const signature = signWebhookPayload(endpoint.secret, timestamp, body);
      let status: 'delivered' | 'failed' = 'failed';
      let lastError: string | null = null;
      try {
        const response = await fetchFn(endpoint.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-kitsune-timestamp': timestamp,
            'x-kitsune-signature': signature,
            'x-kitsune-event': 'change_set.applied',
          },
          body,
        });
        if (response.ok) {
          status = 'delivered';
        } else {
          lastError = `HTTP ${response.status}`;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'delivery failed';
      }

      await client.query(
        `INSERT INTO kitsune.webhook_deliveries
           (id, endpoint_id, workspace_id, event_type, payload, status,
            attempt_count, last_error, change_set_id)
         VALUES ($1, $2, $3, 'change_set.applied', $4::jsonb, $5, 1, $6, $7)`,
        [
          deliveryId,
          endpoint.id,
          input.workspaceId,
          body,
          status,
          lastError,
          input.changeSetId,
        ],
      );
      deliveries.push({
        id: deliveryId,
        endpointId: endpoint.id,
        eventType: 'change_set.applied',
        status,
        attemptCount: 1,
        lastError,
      });
    }
  } finally {
    client.release();
  }
  return deliveries;
}
