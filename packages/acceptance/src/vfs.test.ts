import { createMcpHandlers } from '@kitsuneos/mcp';
import { describe, expect, it } from 'vitest';
import {
  createStandardFixture,
  getEngine,
  seedAccount,
  seedOpportunity,
} from './fixtures.js';

describe('virtual filesystem (grant-aware)', () => {
  it('lists only grant-visible collections and fields', async () => {
    const engine = await getEngine();
    const fixture = await createStandardFixture(engine);
    const accountId = await seedAccount(engine, fixture, {
      name: 'VFS Co',
      industry: 'tech',
    });
    const oppId = await seedOpportunity(engine, fixture, {
      account_id: accountId,
      name: 'Deal',
      amount: 9,
      stage: 'prospecting',
      next_step: '# Next\n\nShip the VFS projection.',
    });

    const root = await engine.vfsList(
      fixture.workspaceId,
      fixture.readerId,
      '/',
    );
    expect(root.entries.map((e) => e.name).sort()).toEqual(['opportunities']);

    const records = await engine.vfsList(
      fixture.workspaceId,
      fixture.adminId,
      '/opportunities',
    );
    expect(records.entries.some((e) => e.name === oppId)).toBe(true);

    const files = await engine.vfsList(
      fixture.workspaceId,
      fixture.readerId,
      `/opportunities/${oppId}`,
    );
    const names = files.entries.map((e) => e.name).sort();
    expect(names).toEqual(['name.json', 'stage.json']);
    expect(names).not.toContain('next_step.md');
    expect(names).not.toContain('amount.json');
  });

  it('reads prose as markdown and scalars as json under grants', async () => {
    const engine = await getEngine();
    const fixture = await createStandardFixture(engine);
    const accountId = await seedAccount(engine, fixture, {
      name: 'Read Co',
      industry: 'tech',
    });
    const oppId = await seedOpportunity(engine, fixture, {
      account_id: accountId,
      name: 'Deal',
      amount: 42,
      stage: 'negotiation',
      next_step: 'Call the buyer',
    });

    const prose = await engine.vfsRead(
      fixture.workspaceId,
      fixture.adminId,
      `/opportunities/${oppId}/next_step.md`,
    );
    expect(prose.contentType).toBe('text/markdown');
    expect(prose.content).toBe('Call the buyer');

    const stage = await engine.vfsRead(
      fixture.workspaceId,
      fixture.readerId,
      `/opportunities/${oppId}/stage.json`,
    );
    expect(JSON.parse(stage.content)).toBe('negotiation');

    await expect(
      engine.vfsRead(
        fixture.workspaceId,
        fixture.readerId,
        `/opportunities/${oppId}/next_step.md`,
      ),
    ).rejects.toMatchObject({ code: 'not_found' });

    await expect(
      engine.vfsRead(
        fixture.workspaceId,
        fixture.readerId,
        `/accounts/${accountId}/name.json`,
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('MCP ls/read mirror engine grants', async () => {
    const engine = await getEngine();
    const fixture = await createStandardFixture(engine);
    const accountId = await seedAccount(engine, fixture, {
      name: 'MCP Co',
      industry: 'tech',
    });
    const oppId = await seedOpportunity(engine, fixture, {
      account_id: accountId,
      name: 'Deal',
      amount: 1,
      stage: 'prospecting',
      next_step: 'Agent notes',
    });

    const handlers = createMcpHandlers(engine, () => ({
      workspaceId: fixture.workspaceId,
      principalId: fixture.limitedAgentId,
    }));
    // limitedAgent: propose on opportunities with mask name, stage — read via capability propose includes read
    const listed = await handlers.ls({
      path: `/opportunities/${oppId}`,
    });
    expect(listed.entries.map((e) => e.name).sort()).toEqual([
      'name.json',
      'stage.json',
    ]);

    const nameFile = await handlers.read({
      path: `/opportunities/${oppId}/name.json`,
    });
    expect(JSON.parse(nameFile.content)).toBe('Deal');
  });
});
