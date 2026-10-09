import type { KitsuneEngine } from '@kitsuneos/core';
import { v4 as uuidv4 } from 'uuid';
import { syncWorkspaceToWorkOS } from './sync-workos.js';

export interface ProvisionUserInput {
  workosId: string;
  email: string;
}

export interface ProvisionUserResult {
  userId: string;
  workspaceId: string;
  principalId: string;
  schemaName: string;
  apiKeyPlaintext: string | null;
  created: string[];
  skipped: string[];
}

/**
 * Idempotent per workosId. Creates an empty workspace (no starter databases).
 * Interactive onboarding creates the first databases in the console.
 */
export async function provisionUserWorkspace(
  engine: KitsuneEngine,
  input: ProvisionUserInput,
): Promise<ProvisionUserResult> {
  const created: string[] = [];
  const skipped: string[] = [];

  return engine.withAdvisoryLock(input.workosId, async () => {
    const existing = await engine.findUserByWorkosId(input.workosId);
    if (existing?.workspaceId && existing.principalId && existing.schemaName) {
      return {
        userId: existing.userId,
        workspaceId: existing.workspaceId,
        principalId: existing.principalId,
        schemaName: existing.schemaName,
        apiKeyPlaintext: null,
        created,
        skipped: ['already provisioned'],
      };
    }

    const userId = uuidv4();
    const slug = `ws-${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const { workspaceId, schemaName } = await engine.createWorkspace(slug);
    created.push('workspace');

    const principalId = await engine.createPrincipal(
      workspaceId,
      'human',
      input.email,
      {
        externalIssuer: 'workos',
        externalSubject: input.workosId,
      },
    );
    created.push('principal');

    await engine.insertUser({
      userId,
      workosId: input.workosId,
      email: input.email,
      workspaceId,
      principalId,
      pendingApiKey: null,
    });
    created.push('user');

    await engine.ensureOwnerMembership({
      userId,
      workspaceId,
      principalId,
      email: input.email,
    });
    created.push('membership:owner');

    const claimed = await engine.claimInvitesForUser({
      userId,
      email: input.email,
    });
    if (claimed > 0) {
      created.push(`membership:claimed:${claimed}`);
    }

    const workosOrgId = await syncWorkspaceToWorkOS(engine, {
      workspaceId,
      name: input.email,
      ownerWorkosUserId: input.workosId,
    });
    if (workosOrgId) {
      created.push('workos:organization');
    }

    return {
      userId,
      workspaceId,
      principalId,
      schemaName,
      apiKeyPlaintext: null,
      created,
      skipped,
    };
  });
}

export interface CreateAdditionalWorkspaceInput {
  userId: string;
  email: string;
  name?: string;
  /** When true (default), set users.workspace_id to the new workspace. */
  activate?: boolean;
}

export interface CreateAdditionalWorkspaceResult {
  workspaceId: string;
  principalId: string;
  schemaName: string;
  workspaceName: string;
  apiKeyPlaintext: string | null;
  created: string[];
}

/**
 * Create another empty workspace for an existing user.
 */
export async function createAdditionalWorkspaceForUser(
  engine: KitsuneEngine,
  input: CreateAdditionalWorkspaceInput,
): Promise<CreateAdditionalWorkspaceResult> {
  await engine.assertPlanLimit({
    dimension: 'workspacesPerUser',
    userId: input.userId,
  });

  const created: string[] = [];
  const activate = input.activate !== false;
  const displayName =
    input.name?.trim() || `Workspace ${new Date().toISOString().slice(0, 10)}`;

  const slug = `ws-${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  const { workspaceId, schemaName } = await engine.createWorkspace(slug);
  created.push('workspace');

  await engine.setWorkspaceName(workspaceId, displayName);

  const principalId = await engine.createPrincipal(
    workspaceId,
    'human',
    input.email,
  );
  created.push('principal');

  await engine.ensureOwnerMembership({
    userId: input.userId,
    workspaceId,
    principalId,
    email: input.email,
  });
  created.push('membership:owner');

  if (activate) {
    await engine.setUserActiveMembership({
      userId: input.userId,
      workspaceId,
      principalId,
      clearPendingApiKey: true,
    });
  }

  const ownerWorkosId = await engine.getUserWorkosId(input.userId);
  const workosOrgId = await syncWorkspaceToWorkOS(engine, {
    workspaceId,
    name: displayName,
    ownerWorkosUserId: ownerWorkosId ?? undefined,
  });
  if (workosOrgId) {
    created.push('workos:organization');
  }

  return {
    workspaceId,
    principalId,
    schemaName,
    workspaceName: displayName,
    apiKeyPlaintext: null,
    created,
  };
}
