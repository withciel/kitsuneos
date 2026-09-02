import { describe, expect, it, beforeAll } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { getEngine } from './fixtures.js';
import { provisionUserWorkspace } from '@kitsuneos/provisioning';
import type { KitsuneEngine } from '@kitsuneos/core';

describe('Signup provisioning', () => {
  let engine: KitsuneEngine;

  beforeAll(async () => {
    engine = await getEngine();
  });

  it('provisions a fresh workspace with starter collections and API key', async () => {
    const workosId = `user_${uuidv4()}`;
    const first = await provisionUserWorkspace(engine, {
      workosId,
      email: `${workosId}@example.com`,
    });
    expect(first.workspaceId).toBeTruthy();
    expect(first.apiKeyPlaintext).toMatch(/^kso_live_/);
    expect(first.created).toContain('workspace');
    expect(first.created).toContain('collection:opportunities');

    const second = await provisionUserWorkspace(engine, {
      workosId,
      email: `${workosId}@example.com`,
    });
    expect(second.workspaceId).toBe(first.workspaceId);
    expect(second.apiKeyPlaintext).toBeNull();
    expect(second.skipped).toContain('already provisioned');
  });

  it('two fresh signups produce isolated workspaces', async () => {
    const a = await provisionUserWorkspace(engine, {
      workosId: `user_${uuidv4()}`,
      email: 'a@example.com',
    });
    const b = await provisionUserWorkspace(engine, {
      workosId: `user_${uuidv4()}`,
      email: 'b@example.com',
    });
    expect(a.workspaceId).not.toBe(b.workspaceId);

    const rowsA = await engine.query(a.workspaceId, a.principalId, {
      collection: 'opportunities',
      fields: ['name'],
    });
    const rowsB = await engine.query(b.workspaceId, b.principalId, {
      collection: 'opportunities',
      fields: ['name'],
    });
    expect(rowsA.length).toBeGreaterThan(0);
    expect(rowsB.length).toBeGreaterThan(0);

    const crossRead = await engine.readRecord(
      a.workspaceId,
      a.principalId,
      'opportunities',
      rowsB[0]!.id as string,
      ['name'],
    );
    expect(crossRead).toBeNull();
  });
});
