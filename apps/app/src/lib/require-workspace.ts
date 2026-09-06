import type { KitsuneEngine, WorkspaceMembership } from '@kitsuneos/core';
import {
  claimInvitesForUser,
  KitsuneError,
  listMembershipsForUser,
} from '@kitsuneos/core';
import { provisionUserWorkspace } from '@kitsuneos/provisioning';
import { headers } from 'next/headers';

export interface WorkspaceContext {
  userId: string;
  workspaceId: string;
  principalId: string;
  apiKeyPlaintext?: string;
}

let sharedEngine: KitsuneEngine | null = null;

export function setEngine(engine: KitsuneEngine): void {
  sharedEngine = engine;
}

function getEngine(): KitsuneEngine {
  if (!sharedEngine) {
    throw new KitsuneError('Engine not initialized', 'internal');
  }
  return sharedEngine;
}

async function lookupUserRow(
  engine: KitsuneEngine,
  workosId: string,
): Promise<{
  userId: string;
  email: string;
  workspaceId: string | null;
  principalId: string | null;
} | null> {
  const row = await engine.ownerPool.query<{
    id: string;
    email: string;
    workspace_id: string | null;
    principal_id: string | null;
  }>(
    `SELECT id, email, workspace_id, principal_id
       FROM kitsune.users WHERE workos_id = $1`,
    [workosId],
  );
  if (!row.rows[0]) {
    return null;
  }
  return {
    userId: row.rows[0].id,
    email: row.rows[0].email,
    workspaceId: row.rows[0].workspace_id,
    principalId: row.rows[0].principal_id,
  };
}

function pickMembership(
  memberships: WorkspaceMembership[],
  preferredWorkspaceId: string | null,
): WorkspaceMembership {
  if (memberships.length === 0) {
    throw new KitsuneError('No workspace membership found', 'forbidden');
  }
  if (preferredWorkspaceId) {
    const preferred = memberships.find(
      (m) => m.workspaceId === preferredWorkspaceId,
    );
    if (preferred) {
      return preferred;
    }
  }
  return memberships[0]!;
}

async function resolveMembershipContext(
  engine: KitsuneEngine,
  user: {
    userId: string;
    email: string;
    workspaceId: string | null;
    principalId: string | null;
  },
  apiKeyPlaintext?: string,
): Promise<WorkspaceContext> {
  await claimInvitesForUser(engine.ownerPool, {
    userId: user.userId,
    email: user.email,
  });

  const memberships = await listMembershipsForUser(
    engine.ownerPool,
    user.userId,
  );
  const active = pickMembership(memberships, user.workspaceId);

  if (
    active.workspaceId !== user.workspaceId ||
    active.principalId !== user.principalId
  ) {
    await engine.ownerPool.query(
      `UPDATE kitsune.users
          SET workspace_id = $2, principal_id = $3
        WHERE id = $1`,
      [user.userId, active.workspaceId, active.principalId],
    );
  }

  return {
    userId: user.userId,
    workspaceId: active.workspaceId,
    principalId: active.principalId,
    apiKeyPlaintext,
  };
}

/** The single resolution path. No caller may pass a workspace. */
export async function requireWorkspace(): Promise<WorkspaceContext> {
  const headerStore = await headers();
  const testUser = headerStore.get('x-kitsune-test-user');
  if (testUser && process.env.KITSUNE_ALLOW_TEST_USER_HEADER === '1') {
    const engine = getEngine();
    let user = await lookupUserRow(engine, testUser);
    let apiKeyPlaintext: string | undefined;
    if (!user) {
      // Local demo / eval: provision on first request instead of requiring seed.
      const email =
        process.env.KITSUNE_DEMO_EMAIL?.trim() || `${testUser}@localhost`;
      const provisioned = await provisionUserWorkspace(engine, {
        workosId: testUser,
        email,
      });
      user = {
        userId: provisioned.userId,
        email,
        workspaceId: provisioned.workspaceId,
        principalId: provisioned.principalId,
      };
      apiKeyPlaintext = provisioned.apiKeyPlaintext ?? undefined;
    }
    return resolveMembershipContext(engine, user, apiKeyPlaintext);
  }

  const { withAuth } = await import('@workos-inc/authkit-nextjs');
  const { user: authUser } = await withAuth();
  if (!authUser) {
    throw new KitsuneError('Unauthorized', 'forbidden');
  }

  const engine = getEngine();
  let user = await lookupUserRow(engine, authUser.id);
  let apiKeyPlaintext: string | undefined;
  if (!user) {
    const provisioned = await provisionUserWorkspace(engine, {
      workosId: authUser.id,
      email: authUser.email,
    });
    user = {
      userId: provisioned.userId,
      email: authUser.email,
      workspaceId: provisioned.workspaceId,
      principalId: provisioned.principalId,
    };
    apiKeyPlaintext = provisioned.apiKeyPlaintext ?? undefined;
  }
  return resolveMembershipContext(engine, user, apiKeyPlaintext);
}

/** Read and clear the one-time API key reveal stored at provision time. */
export async function consumePendingApiKey(
  userId: string,
): Promise<string | null> {
  const engine = getEngine();
  const result = await engine.ownerPool.query<{
    pending_api_key: string | null;
  }>(`SELECT pending_api_key FROM kitsune.users WHERE id = $1`, [userId]);
  const pending = result.rows[0]?.pending_api_key ?? null;
  if (!pending) return null;
  await engine.ownerPool.query(
    `UPDATE kitsune.users SET pending_api_key = NULL WHERE id = $1`,
    [userId],
  );
  return pending;
}
