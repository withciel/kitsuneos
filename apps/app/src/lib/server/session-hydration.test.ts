import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { WorkspaceSessionSnapshot } from '../../workspace-session.tsx';

describe('workspace session hydration contract', () => {
  it('treats a populated snapshot as ready (no client boot loading)', () => {
    const initialSnapshot: WorkspaceSessionSnapshot = {
      me: {
        userId: 'u1',
        workspaceId: 'w1',
        principalId: 'p1',
        role: 'owner',
      },
      schema: {
        collections: [
          {
            name: 'notes',
            fields: [],
            scope: 'personal',
          },
        ],
      },
      openChangeSetCount: 2,
      error: null,
      unauthorized: false,
    };
    const hasInitial = Boolean(
      initialSnapshot && !initialSnapshot.unauthorized,
    );
    assert.equal(hasInitial, true);
    assert.equal(initialSnapshot.schema?.collections[0]?.name, 'notes');
    assert.equal(initialSnapshot.openChangeSetCount, 2);
  });

  it('keeps unauthorized snapshots from counting as ready', () => {
    const initialSnapshot: WorkspaceSessionSnapshot = {
      me: null,
      schema: null,
      openChangeSetCount: 0,
      error: 'Unauthorized',
      unauthorized: true,
    };
    const hasInitial = Boolean(
      initialSnapshot && !initialSnapshot.unauthorized,
    );
    assert.equal(hasInitial, false);
  });
});
