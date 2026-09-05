import type { KitsuneEngine } from '@kitsuneos/core';
import { createHttpMcpServer, resetRateLimits } from '@kitsuneos/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createStandardFixture,
  type Fixture,
  getEngine,
  issueApiKey,
} from './fixtures.js';

async function callTool(
  baseUrl: string,
  apiKey: string,
  tool: string,
  args: Record<string, unknown> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}/mcp/tools/call`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tool, arguments: args }),
  });
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}

describe('MCP webhook endpoint tools (R12)', () => {
  let engine: KitsuneEngine;
  let fixture: Fixture;
  let httpServer: ReturnType<typeof createHttpMcpServer>;
  let baseUrl: string;
  let adminKey: string;
  let readerKey: string;

  beforeAll(async () => {
    engine = await getEngine();
    fixture = await createStandardFixture(engine);
    adminKey = (await issueApiKey(engine, fixture.adminId)).plaintext;
    readerKey = (await issueApiKey(engine, fixture.readerId)).plaintext;
    httpServer = createHttpMcpServer(engine);
    const bound = await httpServer.listen();
    baseUrl = bound.url;
  });

  afterAll(async () => {
    await httpServer.close();
    resetRateLimits();
  });

  it('lets admins create, list, and delete webhook endpoints via MCP', async () => {
    const created = await callTool(
      baseUrl,
      adminKey,
      'create_webhook_endpoint',
      {
        url: 'https://example.com/kitsune-hooks',
        events: ['change_set.applied'],
      },
    );
    expect(created.status).toBe(200);
    const payload = created.body.result as { id: string; secret: string };
    expect(payload.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(payload.secret.length).toBeGreaterThan(16);

    const listed = await callTool(baseUrl, adminKey, 'list_webhook_endpoints');
    expect(listed.status).toBe(200);
    const endpoints = listed.body.result as Array<{ id: string; url: string }>;
    expect(endpoints.some((row) => row.id === payload.id)).toBe(true);
    expect(JSON.stringify(endpoints)).not.toContain(payload.secret);

    const deleted = await callTool(
      baseUrl,
      adminKey,
      'delete_webhook_endpoint',
      {
        endpointId: payload.id,
      },
    );
    expect(deleted.status).toBe(200);

    const listedAfter = await callTool(
      baseUrl,
      adminKey,
      'list_webhook_endpoints',
    );
    const after = listedAfter.body.result as Array<{ id: string }>;
    expect(after.some((row) => row.id === payload.id)).toBe(false);
  });

  it('hides webhook management from non-admins', async () => {
    const created = await callTool(
      baseUrl,
      readerKey,
      'create_webhook_endpoint',
      { url: 'https://example.com/nope' },
    );
    expect(created.status).toBe(400);
    expect(created.body.error).toBe('not_found');
  });
});
