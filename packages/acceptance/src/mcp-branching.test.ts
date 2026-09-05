import type { KitsuneEngine } from '@kitsuneos/core';
import { createHttpMcpServer, resetRateLimits } from '@kitsuneos/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createStandardFixture,
  type Fixture,
  getEngine,
  issueApiKey,
  seedAccount,
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

describe('MCP branch tools (R15)', () => {
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

  it('lets admins create and list branches via MCP', async () => {
    await seedAccount(engine, fixture, {
      name: 'McpBranchCo',
      industry: 'software',
    });

    const created = await callTool(baseUrl, adminKey, 'create_branch', {
      name: 'mcp-staging',
    });
    expect(created.status).toBe(200);
    const branch = created.body.result as {
      workspaceId: string;
      branchName: string;
      parentWorkspaceId: string;
      schemaName: string;
    };
    expect(branch.branchName).toBe('mcp-staging');
    expect(branch.parentWorkspaceId).toBe(fixture.workspaceId);
    expect(branch.schemaName).not.toBe(fixture.schemaName);

    const listed = await callTool(baseUrl, adminKey, 'list_branches');
    expect(listed.status).toBe(200);
    const branches = listed.body.result as Array<{
      workspaceId: string;
      branchName: string;
    }>;
    expect(branches.some((row) => row.workspaceId === branch.workspaceId)).toBe(
      true,
    );
  });

  it('hides branch tools from non-admins', async () => {
    const created = await callTool(baseUrl, readerKey, 'create_branch', {
      name: 'reader-branch',
    });
    expect(created.status).toBe(400);
    expect(created.body.error).toBe('not_found');
  });
});
