import type { KitsuneEngine } from '@kitsuneos/core';
import { provisionUserWorkspace } from '@kitsuneos/provisioning';
import { v4 as uuidv4 } from 'uuid';
import { beforeAll, describe, expect, it } from 'vitest';
import { getEngine } from './fixtures.js';

describe('Accounts, workspaces, and teams', () => {
  let engine: KitsuneEngine;

  beforeAll(async () => {
    engine = await getEngine();
  });

  it('records an owner membership on signup', async () => {
    const workosId = `user_${uuidv4()}`;
    const provisioned = await provisionUserWorkspace(engine, {
      workosId,
      email: `${workosId}@example.com`,
    });
    expect(provisioned.created).toContain('membership:owner');

    const memberships = await engine.listUserMemberships(provisioned.userId);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.workspaceId).toBe(provisioned.workspaceId);
    expect(memberships[0]?.principalId).toBe(provisioned.principalId);
    expect(memberships[0]?.role).toBe('owner');
  });

  it('lets an owner invite a person and claim the invite on signup', async () => {
    const owner = await provisionUserWorkspace(engine, {
      workosId: `owner_${uuidv4()}`,
      email: `owner_${uuidv4()}@example.com`,
    });

    const inviteEmail = `invitee_${uuidv4()}@example.com`;
    const invited = await engine.invitePerson(owner.workspaceId, owner.userId, {
      email: inviteEmail,
      role: 'member',
      displayName: 'Invitee',
    });

    const beforeClaim = await engine.listWorkspaceMemberships(
      owner.workspaceId,
    );
    const pending = beforeClaim.find((m) => m.email === inviteEmail);
    expect(pending?.userId).toBeNull();
    expect(pending?.principalId).toBe(invited.principalId);

    const invitee = await provisionUserWorkspace(engine, {
      workosId: `invitee_${uuidv4()}`,
      email: inviteEmail,
    });
    expect(
      invitee.created.some((item) => item.startsWith('membership:claimed:')),
    ).toBe(true);

    const inviteeMemberships = await engine.listUserMemberships(invitee.userId);
    const claimed = inviteeMemberships.find(
      (m) => m.workspaceId === owner.workspaceId,
    );
    expect(claimed?.role).toBe('member');
    expect(claimed?.principalId).toBe(invited.principalId);

    // Invitee still gets their own workspace plus the claimed one.
    expect(inviteeMemberships.length).toBeGreaterThanOrEqual(2);
  });

  it('shares collection access through a team grant', async () => {
    const owner = await provisionUserWorkspace(engine, {
      workosId: `team_owner_${uuidv4()}`,
      email: `team_owner_${uuidv4()}@example.com`,
    });

    const memberEmail = `teammate_${uuidv4()}@example.com`;
    const invited = await engine.invitePerson(owner.workspaceId, owner.userId, {
      email: memberEmail,
      role: 'member',
    });

    const team = await engine.createTeam(
      owner.workspaceId,
      owner.principalId,
      `Sales ${uuidv4().slice(0, 8)}`,
    );
    await engine.addPersonToTeam(owner.workspaceId, owner.principalId, {
      teamId: team.id,
      principalId: invited.principalId,
    });

    const collections = await engine.ownerPool.query<{ id: string }>(
      `SELECT id FROM kitsune.collections
        WHERE workspace_id = $1 AND name = 'opportunities'`,
      [owner.workspaceId],
    );
    const opportunitiesId = collections.rows[0]?.id;
    expect(opportunitiesId).toBeTruthy();
    if (!opportunitiesId) {
      throw new Error('expected opportunities collection');
    }

    await engine.createGrant(
      owner.workspaceId,
      team.principalId,
      opportunitiesId,
      'read',
      null,
      null,
      { actorId: owner.principalId },
    );

    // Member has no direct grant — access comes via the team.
    const rows = await engine.query(owner.workspaceId, invited.principalId, {
      collection: 'opportunities',
      fields: ['name'],
    });
    expect(rows.length).toBeGreaterThan(0);
  });
});
