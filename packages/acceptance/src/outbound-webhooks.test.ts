import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { KitsuneEngine } from '@kitsuneos/core';
import { signWebhookPayload } from '@kitsuneos/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createStandardFixture,
  type Fixture,
  getEngine,
  seedAccount,
} from './fixtures.js';

interface ReceivedWebhook {
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

async function listen(
  handler: (req: IncomingMessage, body: string) => void,
): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      handler(req, body);
      res.statusCode = 200;
      res.end('ok');
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind webhook test server');
  }
  return { server, url: `http://127.0.0.1:${address.port}/hooks` };
}

describe('R12 outbound webhooks', () => {
  let engine: KitsuneEngine;
  let fixture: Fixture;
  let server: Server;
  let webhookUrl: string;
  let received: ReceivedWebhook[];

  beforeAll(async () => {
    engine = await getEngine();
    fixture = await createStandardFixture(engine);
    received = [];
    const listening = await listen((req, body) => {
      received.push({ headers: { ...req.headers }, body });
    });
    server = listening.server;
    webhookUrl = listening.url;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('delivers signed change_set.applied events after apply', async () => {
    received.length = 0;
    const endpoint = await engine.createWebhookEndpoint(
      fixture.workspaceId,
      fixture.adminId,
      { url: webhookUrl, events: ['change_set.applied'] },
    );

    const accountId = await seedAccount(engine, fixture, {
      name: 'WebhookCo',
    });

    const proposed = await engine.proposeChangeSet(
      fixture.workspaceId,
      fixture.adminId,
      {
        operations: [
          {
            collection: 'accounts',
            recordId: accountId,
            op: 'update',
            fieldName: 'name',
            newValue: 'WebhookApplied',
          },
        ],
      },
    );

    await engine.reviewChangeSet(
      fixture.workspaceId,
      fixture.reviewerId,
      proposed.changeSetId,
      proposed.operationIds.map((opId) => ({
        opId,
        status: 'approved' as const,
      })),
    );

    const applied = await engine.applyChangeSet(
      fixture.workspaceId,
      fixture.reviewerId,
      proposed.changeSetId,
    );
    expect(applied.status).toBe('applied');

    await expect
      .poll(() => received.length, { timeout: 5000 })
      .toBeGreaterThan(0);

    const delivery = received[0];
    expect(delivery).toBeDefined();
    if (!delivery) {
      throw new Error('expected webhook delivery');
    }

    expect(delivery.headers['x-kitsune-event']).toBe('change_set.applied');
    const timestamp = String(delivery.headers['x-kitsune-timestamp'] ?? '');
    const signature = String(delivery.headers['x-kitsune-signature'] ?? '');
    expect(timestamp).toMatch(/^\d+$/);
    expect(signature).toBe(
      signWebhookPayload(endpoint.secret, timestamp, delivery.body),
    );

    const payload = JSON.parse(delivery.body) as {
      type: string;
      workspaceId: string;
      changeSetId: string;
      operations: Array<{ collection: string; fieldName: string | null }>;
    };
    expect(payload.type).toBe('change_set.applied');
    expect(payload.workspaceId).toBe(fixture.workspaceId);
    expect(payload.changeSetId).toBe(proposed.changeSetId);
    expect(payload.operations[0]?.collection).toBe('accounts');
    expect(payload.operations[0]?.fieldName).toBe('name');

    const rows = await engine.ownerPool.query<{
      status: string;
      event_type: string;
      endpoint_id: string;
    }>(
      `SELECT status, event_type, endpoint_id
         FROM kitsune.webhook_deliveries
        WHERE change_set_id = $1`,
      [proposed.changeSetId],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]?.status).toBe('delivered');
    expect(rows.rows[0]?.event_type).toBe('change_set.applied');
    expect(rows.rows[0]?.endpoint_id).toBe(endpoint.id);

    const listed = await engine.listWebhookEndpoints(
      fixture.workspaceId,
      fixture.adminId,
    );
    expect(listed.some((row) => row.id === endpoint.id)).toBe(true);

    await engine.deleteWebhookEndpoint(
      fixture.workspaceId,
      fixture.adminId,
      endpoint.id,
    );
    const listedAfter = await engine.listWebhookEndpoints(
      fixture.workspaceId,
      fixture.adminId,
    );
    expect(listedAfter.some((row) => row.id === endpoint.id)).toBe(false);
  });

  it('hides webhook management from non-admins', async () => {
    await expect(
      engine.createWebhookEndpoint(fixture.workspaceId, fixture.readerId, {
        url: webhookUrl,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
