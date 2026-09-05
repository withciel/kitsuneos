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

describe('MCP principal identity tools (R16)', () => {
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

  it('lets admins link and resolve principal identities via MCP', async () => {
    const subject = `mcp_fed_${fixture.workspaceId.slice(0, 8)}`;
    const linked = await callTool(
      baseUrl,
      adminKey,
      'link_principal_identity',
      {
        principalId: fixture.adminId,
        externalIssuer: 'workos',
        externalSubject: subject,
      },
    );
    expect(linked.status).toBe(200);

    const resolved = await callTool(
      baseUrl,
      adminKey,
      'resolve_principal_identity',
      {
        externalIssuer: 'workos',
        externalSubject: subject,
      },
    );
    expect(resolved.status).toBe(200);
    const hits = resolved.body.result as Array<{
      principalId: string;
      workspaceId: string;
    }>;
    expect(
      hits.some(
        (h) =>
          h.principalId === fixture.adminId &&
          h.workspaceId === fixture.workspaceId,
      ),
    ).toBe(true);
  });

  it('hides identity tools from non-admins', async () => {
    const linked = await callTool(
      baseUrl,
      readerKey,
      'link_principal_identity',
      {
        principalId: fixture.readerId,
        externalIssuer: 'workos',
        externalSubject: `mcp_reader_${fixture.workspaceId.slice(0, 8)}`,
      },
    );
    expect(linked.status).toBe(400);
    expect(linked.body.error).toBe('not_found');
  });
});
