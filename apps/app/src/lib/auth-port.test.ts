import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { WorkspaceMembership } from '@kitsuneos/core';
import { KitsuneError } from '@kitsuneos/core';
import {
  type AuthPort,
  getAuthPort,
  resetAuthPort,
  setAuthPort,
} from './auth-port.ts';
import { pickMembership } from './pick-membership.ts';

function membership(
  workspaceId: string,
  principalId: string,
  role: WorkspaceMembership['role'] = 'member',
): WorkspaceMembership {
  return {
    id: `m-${workspaceId}`,
    workspaceId,
    workspaceName: workspaceId,
    principalId,
    role,
    userId: 'user-1',
    email: 'member@example.com',
  };
}

describe('AuthPort', () => {
  it('fake port returns null for unauthorized', async () => {
    const fake: AuthPort = {
      async getSessionIdentity() {
        return null;
      },
    };
    setAuthPort(fake);
    try {
      assert.equal(await getAuthPort().getSessionIdentity(), null);
    } finally {
      resetAuthPort();
    }
  });

  it('fake port returns a session identity', async () => {
    const fake: AuthPort = {
      async getSessionIdentity() {
        return {
          externalId: 'user_test',
          email: 'test@example.com',
          firstName: 'Ada',
          lastName: 'Lovelace',
        };
      },
    };
    setAuthPort(fake);
    try {
      const identity = await getAuthPort().getSessionIdentity();
      assert.deepEqual(identity, {
        externalId: 'user_test',
        email: 'test@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
      });
    } finally {
      resetAuthPort();
    }
  });
});

describe('pickMembership', () => {
  it('throws when there are no memberships', () => {
    assert.throws(
      () => pickMembership([], null),
      (err: unknown) => err instanceof KitsuneError && err.code === 'forbidden',
    );
  });

  it('prefers the stored active workspace when present', () => {
    const rows = [
      membership('ws-a', 'p-a'),
      membership('ws-b', 'p-b', 'admin'),
    ];
    const picked = pickMembership(rows, 'ws-b');
    assert.equal(picked.workspaceId, 'ws-b');
    assert.equal(picked.principalId, 'p-b');
  });

  it('falls back to the first membership when preferred is missing', () => {
    const rows = [membership('ws-a', 'p-a'), membership('ws-b', 'p-b')];
    const picked = pickMembership(rows, 'ws-missing');
    assert.equal(picked.workspaceId, 'ws-a');
  });
});
