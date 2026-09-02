import type { KitsuneEngine } from '@kitsuneos/core';
import { revokeApiKey } from '@kitsuneos/core';
import { TOOL_DEFINITIONS } from '@kitsuneos/mcp/schemas';
import { createHttpMcpServer, resetRateLimits } from '@kitsuneos/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createStandardFixture,
  type Fixture,
  getEngine,
  issueApiKey,
  seedAccount,
  seedOpportunity,
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

describe('Remote MCP and API keys', () => {
  let engine: KitsuneEngine;
  let fixtureA: Fixture;
  let fixtureB: Fixture;
  let httpServer: ReturnType<typeof createHttpMcpServer>;
  let baseUrl: string;
  let keyA: string;
  let keyB: string;
  let _keyAId: string;

  beforeAll(async () => {
    engine = await getEngine();
    fixtureA = await createStandardFixture(engine);
    fixtureB = await createStandardFixture(engine);
    const createdA = await issueApiKey(engine, fixtureA.adminId);
    const createdB = await issueApiKey(engine, fixtureB.adminId);
    keyA = createdA.plaintext;
    _keyAId = createdA.keyId;
    keyB = createdB.plaintext;
    httpServer = createHttpMcpServer(engine);
    const bound = await httpServer.listen();
    baseUrl = bound.url;
  });

  afterAll(async () => {
    await httpServer.close();
    resetRateLimits();
  });

  it('Leak defense 1: workspace is derived from credential, not client input', async () => {
    for (const tool of TOOL_DEFINITIONS) {
      const schema = tool.inputSchema as {
        properties?: Record<string, unknown>;
      };
      const props = schema.properties ?? {};
      expect(props).not.toHaveProperty('workspace');
      expect(props).not.toHaveProperty('workspaceId');
      expect(props).not.toHaveProperty('workspace_id');
    }

    const cross = await callTool(baseUrl, keyA, 'query', {
      collection: 'opportunities',
      fields: ['name'],
      workspaceId: fixtureB.workspaceId,
    } as never);
    expect(cross.status).toBe(400);
    expect(cross.body.message).toMatch(
      /workspace parameters are not permitted/i,
    );
  });

  it('API key for workspace A cannot reach workspace B data via HTTP MCP', async () => {
    const accountB = await seedAccount(engine, fixtureB, {
      name: 'HTTP Tenant B',
    });
    const oppB = await seedOpportunity(engine, fixtureB, {
      account_id: accountB,
      name: 'HTTP Secret',
      amount: 42,
      stage: 'prospecting',
    });

    const leaked = await callTool(baseUrl, keyA, 'read_record', {
      collection: 'opportunities',
      recordId: oppB,
      fields: ['name'],
    });
    expect(leaked.status).toBe(200);
    expect(leaked.body.result).toBeNull();
  });

  it('Revoked API key fails immediately and failure is audited by prefix only', async () => {
    const temp = await issueApiKey(engine, fixtureA.agentId);
    await revokeApiKey(engine.ownerPool, temp.keyId);

    const response = await callTool(baseUrl, temp.plaintext, 'describe_schema');
    expect(response.status).toBe(401);

    const audit = await engine.ownerPool.query<{
      detail: { keyPrefix: string };
    }>(
      `SELECT detail FROM kitsune.audit_log
        WHERE action = 'auth_failed'
        ORDER BY at DESC
        LIMIT 1`,
    );
    expect(audit.rows[0]?.detail.keyPrefix).toBe(temp.prefix);
    expect(JSON.stringify(audit.rows[0])).not.toContain(temp.plaintext);
  });

  it('Rate limits requests per API key', async () => {
    resetRateLimits();
    const limited = createHttpMcpServer(engine);
    const bound = await limited.listen();
    try {
      let saw429 = false;
      for (let i = 0; i < 150; i++) {
        const response = await fetch(`${bound.url}/mcp/tools`, {
          headers: { Authorization: `Bearer ${keyB}` },
        });
        if (response.status === 429) {
          saw429 = true;
          break;
        }
      }
      expect(saw429).toBe(true);
    } finally {
      await limited.close();
      resetRateLimits();
    }
  });

  it('Gate 0b over HTTP: cross-tenant isolation via remote MCP', async () => {
    const accountB = await seedAccount(engine, fixtureB, {
      name: 'Gate HTTP B',
    });
    const oppB = await seedOpportunity(engine, fixtureB, {
      account_id: accountB,
      name: 'Gate HTTP Secret',
      amount: 99,
      stage: 'prospecting',
    });

    const forged = await callTool(baseUrl, keyA, 'query', {
      collection: 'opportunities',
      fields: ['name'],
    });
    expect(forged.status).toBe(200);
    const rows = forged.body.result as Array<{ name: string }>;
    expect(rows.some((r) => r.name === 'Gate HTTP Secret')).toBe(false);

    const crossRead = await callTool(baseUrl, keyA, 'read_record', {
      collection: 'opportunities',
      recordId: oppB,
    });
    expect(crossRead.body.result).toBeNull();

    const injection = await callTool(baseUrl, keyA, 'query', {
      collection: 'opportunities',
      aggregates: [
        {
          fn: 'max(amount) from opportunities t' as 'max',
          field: 'stage',
          alias: 'leak',
        },
      ],
    });
    expect(injection.status).toBe(400);
    expect(injection.body.error).toBe('validation');
  });
});
