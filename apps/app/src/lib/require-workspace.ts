import type { KitsuneEngine } from '@kitsuneos/core';
import { KitsuneError } from '@kitsuneos/core';
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

async function lookupUser(
  engine: KitsuneEngine,
  workosId: string,
): Promise<WorkspaceContext | null> {
  const row = await engine.ownerPool.query<{
    id: string;
    workspace_id: string;
    principal_id: string;
  }>(
    `SELECT id, workspace_id, principal_id FROM kitsune.users WHERE workos_id = $1`,
    [workosId],
  );
  if (!row.rows[0]) {
    return null;
  }
  return {
    userId: row.rows[0].id,
    workspaceId: row.rows[0].workspace_id,
    principalId: row.rows[0].principal_id,
  };
}

/** The single resolution path. No caller may pass a workspace. */
export async function requireWorkspace(): Promise<WorkspaceContext> {
  const headerStore = await headers();
  const testUser = headerStore.get('x-kitsune-test-user');
  if (testUser && process.env.KITSUNE_ALLOW_TEST_USER_HEADER === '1') {
    const engine = getEngine();
    const ctx = await lookupUser(engine, testUser);
    if (!ctx) {
      throw new KitsuneError('Not found', 'not_found');
    }
    return ctx;
  }

  const { withAuth } = await import('@workos-inc/authkit-nextjs');
  const { user } = await withAuth();
  if (!user) {
    throw new KitsuneError('Unauthorized', 'forbidden');
  }

  const engine = getEngine();
  let ctx = await lookupUser(engine, user.id);
  if (!ctx) {
    const provisioned = await provisionUserWorkspace(engine, {
      workosId: user.id,
      email: user.email,
    });
    ctx = {
      userId: provisioned.userId,
      workspaceId: provisioned.workspaceId,
      principalId: provisioned.principalId,
      apiKeyPlaintext: provisioned.apiKeyPlaintext ?? undefined,
    };
  }
  return ctx;
}
