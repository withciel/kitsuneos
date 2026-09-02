import { DEFAULT_CONFIG, KitsuneEngine } from '@kitsuneos/core';
import { provisionUserWorkspace } from '@kitsuneos/provisioning';
import { createHttpMcpServer, resetRateLimits } from '@kitsuneos/server';
import { v4 as uuidv4 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getEngine, issueApiKey } from './fixtures.js';

interface ProvisionedTenant {
  workspaceId: string;
  principalId: string;
  agentPrincipalId: string;
  apiKey: string;
}

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

describe('Gate 0b against provisioned workspaces', () => {
  let engine: ReturnType<typeof getEngine> extends Promise<infer E> ? E : never;
  let tenantA: ProvisionedTenant;
  let tenantB: ProvisionedTenant;
  let oppBId: string;
  let accountBId: string;
  let httpServer: ReturnType<typeof createHttpMcpServer>;
  let baseUrl: string;

  beforeAll(async () => {
    engine = await getEngine();

    const provA = await provisionUserWorkspace(engine, {
      workosId: `gate0b_a_${uuidv4()}`,
      email: `gate0b-a-${uuidv4()}@example.com`,
    });
    const provB = await provisionUserWorkspace(engine, {
      workosId: `gate0b_b_${uuidv4()}`,
      email: `gate0b-b-${uuidv4()}@example.com`,
    });

    const agentB = await engine.ownerPool.query<{ id: string }>(
      `SELECT id FROM kitsune.principals
        WHERE workspace_id = $1 AND kind = 'agent' AND display_name = 'assistant'
        LIMIT 1`,
      [provB.workspaceId],
    );

    const keyA = await issueApiKey(engine, provA.principalId);
    const keyB = await issueApiKey(engine, provB.principalId);

    tenantA = {
      workspaceId: provA.workspaceId,
      principalId: provA.principalId,
      agentPrincipalId: provA.principalId,
      apiKey: keyA.plaintext,
    };
    tenantB = {
      workspaceId: provB.workspaceId,
      principalId: provB.principalId,
      agentPrincipalId: agentB.rows[0]?.id,
      apiKey: keyB.plaintext,
    };

    accountBId = await engine.directWrite(
      tenantB.workspaceId,
      tenantB.principalId,
      'accounts',
      { name: 'Gate0b B Account', industry: 'software' },
    );
    oppBId = await engine.directWrite(
      tenantB.workspaceId,
      tenantB.principalId,
      'opportunities',
      {
        account_id: accountBId,
        name: 'Gate0b B Secret',
        amount: 8888,
        stage: 'prospecting',
        next_step: 'none',
      },
    );

    httpServer = createHttpMcpServer(engine);
    const bound = await httpServer.listen();
    baseUrl = bound.url;
  });

  afterAll(async () => {
    await httpServer.close();
    resetRateLimits();
  });

  it('case 1: forged workspace id at engine layer returns not_found', async () => {
    await expect(
      engine.query(uuidv4(), tenantA.principalId, {
        collection: 'opportunities',
        fields: ['name'],
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('case 2: cross-tenant read_record returns null via HTTP MCP', async () => {
    const result = await callTool(baseUrl, tenantA.apiKey, 'read_record', {
      collection: 'opportunities',
      recordId: oppBId,
      fields: ['name'],
    });
    expect(result.status).toBe(200);
    expect(result.body.result).toBeNull();
  });

  it('case 3: cross-tenant propose on foreign record returns not_found', async () => {
    await expect(
      engine.proposeChangeSet(tenantA.workspaceId, tenantA.agentPrincipalId, {
        operations: [
          {
            collection: 'opportunities',
            recordId: oppBId,
            op: 'update',
            fieldName: 'next_step',
            newValue: 'stolen',
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('case 4: cross-tenant relation target returns not_found', async () => {
    await expect(
      engine.proposeChangeSet(tenantA.workspaceId, tenantA.agentPrincipalId, {
        operations: [
          {
            collection: 'opportunities',
            op: 'insert',
            fieldName: 'account_id',
            newValue: accountBId,
          },
          {
            collection: 'opportunities',
            op: 'insert',
            fieldName: 'name',
            newValue: 'cross relation',
          },
          {
            collection: 'opportunities',
            op: 'insert',
            fieldName: 'stage',
            newValue: 'prospecting',
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('case 5: aggregate injection returns validation, not data leak', async () => {
    const result = await callTool(baseUrl, tenantA.apiKey, 'query', {
      collection: 'opportunities',
      aggregates: [
        {
          fn: 'max(amount) from opportunities t' as 'max',
          field: 'stage',
          alias: 'leak',
        },
      ],
    });
    expect(result.status).toBe(400);
    expect(result.body.error).toBe('validation');

    const leaked = await callTool(baseUrl, tenantA.apiKey, 'query', {
      collection: 'opportunities',
      filters: [{ field: 'name', op: 'eq', value: 'Gate0b B Secret' }],
      fields: ['name'],
    });
    expect(leaked.body.result).toEqual([]);
  });

  it('case 6: pooled connection reuse A then B stays isolated', async () => {
    const isolatedEngine = new KitsuneEngine({
      config: DEFAULT_CONFIG,
      appPoolMax: 1,
    });
    try {
      const fromA = await isolatedEngine.query(
        tenantA.workspaceId,
        tenantA.principalId,
        {
          collection: 'opportunities',
          fields: ['name'],
        },
      );
      expect(fromA.some((row) => row.name === 'Gate0b B Secret')).toBe(false);

      const fromB = await isolatedEngine.query(
        tenantB.workspaceId,
        tenantB.principalId,
        {
          collection: 'opportunities',
          filters: [{ field: 'name', op: 'eq', value: 'Gate0b B Secret' }],
        },
      );
      expect(fromB.length).toBe(1);
      expect(fromB[0]?.id).toBe(oppBId);
    } finally {
      await isolatedEngine.close();
    }
  });
});
