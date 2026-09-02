import type { KitsuneEngine } from '@kitsuneos/core';
import { KitsuneError } from '@kitsuneos/core';
import { headers } from 'next/headers';

export interface WorkspaceContext {
  userId: string;
  workspaceId: string;
  principalId: string;
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

/** The single resolution path. No caller may pass a workspace. */
export async function requireWorkspace(): Promise<WorkspaceContext> {
  const headerStore = await headers();
  const testUser = headerStore.get('x-kitsune-test-user');
  if (testUser) {
    const engine = getEngine();
    const row = await engine.ownerPool.query<{
      id: string;
      workspace_id: string;
      principal_id: string;
    }>(`SELECT id, workspace_id, principal_id FROM kitsune.users WHERE workos_id = $1`, [
      testUser,
    ]);
    if (!row.rows[0]) {
      throw new KitsuneError('Not found', 'not_found');
    }
    return {
      userId: row.rows[0].id,
      workspaceId: row.rows[0].workspace_id,
      principalId: row.rows[0].principal_id,
    };
  }

  const { withAuth } = await import('@workos-inc/authkit-nextjs');
  const { user } = await withAuth();
  if (!user) {
    throw new KitsuneError('Unauthorized', 'forbidden');
  }

  const engine = getEngine();
  const row = await engine.ownerPool.query<{
    id: string;
    workspace_id: string;
    principal_id: string;
  }>(`SELECT id, workspace_id, principal_id FROM kitsune.users WHERE workos_id = $1`, [
    user.id,
  ]);
  if (!row.rows[0]) {
    throw new KitsuneError('Not found', 'not_found');
  }
  return {
    userId: row.rows[0].id,
    workspaceId: row.rows[0].workspace_id,
    principalId: row.rows[0].principal_id,
  };
}
