import type { KitsuneEngine, WorkspaceRole } from '@kitsuneos/core';
import { KitsuneError } from '@kitsuneos/core';
import { provisionUserWorkspace } from '@kitsuneos/provisioning';
import { getAuthPort } from '@/lib/auth-port';
import { pickMembership } from '@/lib/pick-membership';

export { pickMembership } from '@/lib/pick-membership';

export interface WorkspaceContext {
  userId: string;
  workspaceId: string;
  principalId: string;
  role: WorkspaceRole;
  /** Always set for session auth (billing checkout, /api/me, etc.). */
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  apiKeyPlaintext?: string;
}

export function isWorkspaceAdmin(role: WorkspaceRole): boolean {
  return role === 'owner' || role === 'admin';
}

export function requireWorkspaceAdmin(ctx: WorkspaceContext): void {
  if (!isWorkspaceAdmin(ctx.role)) {
    throw new KitsuneError(
      'Only workspace owners and admins can manage people, teams, and access',
      'forbidden',
    );
  }
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
  const row = await engine.findUserByWorkosId(workosId);
  if (!row) return null;
  return {
    userId: row.userId,
    email: row.email,
    workspaceId: row.workspaceId,
    principalId: row.principalId,
  };
}

async function resolveMembershipContext(
  engine: KitsuneEngine,
  user: {
    userId: string;
    email: string;
    workspaceId: string | null;
    principalId: string | null;
  },
  extras?: {
    apiKeyPlaintext?: string;
    firstName?: string | null;
    lastName?: string | null;
  },
): Promise<WorkspaceContext> {
  await engine.claimInvitesForUser({
    userId: user.userId,
    email: user.email,
  });

  const memberships = await engine.listUserMemberships(user.userId);
  const active = pickMembership(memberships, user.workspaceId);

  if (
    active.workspaceId !== user.workspaceId ||
    active.principalId !== user.principalId
  ) {
    await engine.setUserActiveMembership({
      userId: user.userId,
      workspaceId: active.workspaceId,
      principalId: active.principalId,
    });
  }

  return {
    userId: user.userId,
    workspaceId: active.workspaceId,
    principalId: active.principalId,
    role: active.role,
    email: user.email,
    firstName: extras?.firstName,
    lastName: extras?.lastName,
    apiKeyPlaintext: extras?.apiKeyPlaintext,
  };
}

/**
 * Session-only workspace resolution via AuthPort (WorkOS / test header).
 * Workspace is never taken from the client body.
 * For bearer | session, use resolveRequestAuth instead.
 */
export async function requireWorkspace(): Promise<WorkspaceContext> {
  const identity = await getAuthPort().getSessionIdentity();
  if (!identity) {
    throw new KitsuneError('Unauthorized', 'forbidden');
  }

  const engine = getEngine();
  let user = await lookupUserRow(engine, identity.externalId);
  let apiKeyPlaintext: string | undefined;
  if (!user) {
    const provisioned = await provisionUserWorkspace(engine, {
      workosId: identity.externalId,
      email: identity.email,
    });
    user = {
      userId: provisioned.userId,
      email: identity.email,
      workspaceId: provisioned.workspaceId,
      principalId: provisioned.principalId,
    };
    apiKeyPlaintext = provisioned.apiKeyPlaintext ?? undefined;
  }
  return resolveMembershipContext(engine, user, {
    apiKeyPlaintext,
    firstName: identity.firstName,
    lastName: identity.lastName,
  });
}

/** Read and clear the one-time API key reveal stored at provision time. */
export async function consumePendingApiKey(
  userId: string,
): Promise<string | null> {
  const engine = getEngine();
  return engine.consumePendingApiKey(userId);
}
