import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { KitsuneError } from '../types.js';

export type PageVisibility = 'private' | 'workspace' | 'shared';
export type PageShareCapability = 'read' | 'write' | 'full';

export interface PageAccessState {
  visibility: PageVisibility;
  ownerPrincipalId: string;
  shares: Array<{
    principalId: string;
    capability: PageShareCapability;
  }>;
}

async function principalIsWorkspaceAdmin(
  pool: Pool,
  workspaceId: string,
  principalId: string,
): Promise<boolean> {
  const result = await pool.query<{ role: string }>(
    `SELECT m.role
       FROM kitsune.workspace_memberships m
      WHERE m.workspace_id = $1
        AND m.principal_id = $2`,
    [workspaceId, principalId],
  );
  const role = result.rows[0]?.role;
  return role === 'owner' || role === 'admin';
}

/** Principals that effectively include this actor (self + teams they belong to). */
export async function effectivePrincipalIds(
  pool: Pool,
  workspaceId: string,
  principalId: string,
): Promise<string[]> {
  const teams = await pool.query<{ principal_id: string }>(
    `SELECT t.principal_id
       FROM kitsune.team_members tm
       JOIN kitsune.teams t ON t.id = tm.team_id
      WHERE t.workspace_id = $1
        AND tm.principal_id = $2`,
    [workspaceId, principalId],
  );
  return [principalId, ...teams.rows.map((row) => row.principal_id)];
}

export async function getPageAccess(
  pool: Pool,
  input: { workspaceId: string; collectionId: string; recordId: string },
): Promise<PageAccessState | null> {
  const access = await pool.query<{
    visibility: PageVisibility;
    owner_principal_id: string;
  }>(
    `SELECT visibility, owner_principal_id
       FROM kitsune.page_access
      WHERE workspace_id = $1
        AND collection_id = $2
        AND record_id = $3`,
    [input.workspaceId, input.collectionId, input.recordId],
  );
  if (!access.rows[0]) return null;
  const shares = await pool.query<{
    grantee_principal_id: string;
    capability: PageShareCapability;
  }>(
    `SELECT grantee_principal_id, capability
       FROM kitsune.page_shares
      WHERE workspace_id = $1
        AND collection_id = $2
        AND record_id = $3
      ORDER BY created_at ASC`,
    [input.workspaceId, input.collectionId, input.recordId],
  );
  return {
    visibility: access.rows[0].visibility,
    ownerPrincipalId: access.rows[0].owner_principal_id,
    shares: shares.rows.map((row) => ({
      principalId: row.grantee_principal_id,
      capability: row.capability,
    })),
  };
}

export async function upsertPageVisibility(
  pool: Pool,
  input: {
    workspaceId: string;
    collectionId: string;
    recordId: string;
    visibility: PageVisibility;
    ownerPrincipalId: string;
    actorPrincipalId: string;
  },
): Promise<void> {
  const existing = await getPageAccess(pool, input);
  if (existing && existing.ownerPrincipalId !== input.actorPrincipalId) {
    const admin = await principalIsWorkspaceAdmin(
      pool,
      input.workspaceId,
      input.actorPrincipalId,
    );
    if (!admin) {
      throw new KitsuneError(
        'Only the page owner can change visibility',
        'forbidden',
      );
    }
  }
  await pool.query(
    `INSERT INTO kitsune.page_access
       (workspace_id, collection_id, record_id, visibility, owner_principal_id, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (workspace_id, collection_id, record_id) DO UPDATE
       SET visibility = EXCLUDED.visibility,
           updated_at = now()`,
    [
      input.workspaceId,
      input.collectionId,
      input.recordId,
      input.visibility,
      existing?.ownerPrincipalId ?? input.ownerPrincipalId,
    ],
  );
  if (input.visibility !== 'shared') {
    await pool.query(
      `DELETE FROM kitsune.page_shares
        WHERE workspace_id = $1
          AND collection_id = $2
          AND record_id = $3`,
      [input.workspaceId, input.collectionId, input.recordId],
    );
  }
}

export async function sharePageWithPrincipal(
  pool: Pool,
  input: {
    workspaceId: string;
    collectionId: string;
    recordId: string;
    granteePrincipalId: string;
    capability: PageShareCapability;
    actorPrincipalId: string;
  },
): Promise<void> {
  const access = await getPageAccess(pool, input);
  if (!access) {
    throw new KitsuneError('Set page visibility before sharing', 'validation');
  }
  if (access.ownerPrincipalId !== input.actorPrincipalId) {
    const admin = await principalIsWorkspaceAdmin(
      pool,
      input.workspaceId,
      input.actorPrincipalId,
    );
    if (!admin) {
      throw new KitsuneError('Only the page owner can share', 'forbidden');
    }
  }
  if (access.visibility !== 'shared') {
    await pool.query(
      `UPDATE kitsune.page_access
          SET visibility = 'shared', updated_at = now()
        WHERE workspace_id = $1
          AND collection_id = $2
          AND record_id = $3`,
      [input.workspaceId, input.collectionId, input.recordId],
    );
  }
  await pool.query(
    `INSERT INTO kitsune.page_shares
       (id, workspace_id, collection_id, record_id, grantee_principal_id, capability)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (workspace_id, collection_id, record_id, grantee_principal_id)
     DO UPDATE SET capability = EXCLUDED.capability`,
    [
      randomUUID(),
      input.workspaceId,
      input.collectionId,
      input.recordId,
      input.granteePrincipalId,
      input.capability,
    ],
  );
}

export async function unsharePage(
  pool: Pool,
  input: {
    workspaceId: string;
    collectionId: string;
    recordId: string;
    granteePrincipalId: string;
    actorPrincipalId: string;
  },
): Promise<void> {
  const access = await getPageAccess(pool, input);
  if (!access) return;
  if (access.ownerPrincipalId !== input.actorPrincipalId) {
    const admin = await principalIsWorkspaceAdmin(
      pool,
      input.workspaceId,
      input.actorPrincipalId,
    );
    if (!admin) {
      throw new KitsuneError('Only the page owner can unshare', 'forbidden');
    }
  }
  await pool.query(
    `DELETE FROM kitsune.page_shares
      WHERE workspace_id = $1
        AND collection_id = $2
        AND record_id = $3
        AND grantee_principal_id = $4`,
    [
      input.workspaceId,
      input.collectionId,
      input.recordId,
      input.granteePrincipalId,
    ],
  );
}

/**
 * Whether principal may see the page.
 * Missing page_access row => workspace visibility (legacy default).
 * Workspace admins see private pages (auditable policy).
 */
export async function canViewPage(
  pool: Pool,
  input: {
    workspaceId: string;
    collectionId: string;
    recordId: string;
    principalId: string;
  },
): Promise<boolean> {
  const access = await getPageAccess(pool, input);
  if (!access || access.visibility === 'workspace') return true;
  if (access.ownerPrincipalId === input.principalId) return true;
  if (
    await principalIsWorkspaceAdmin(pool, input.workspaceId, input.principalId)
  ) {
    return true;
  }
  if (access.visibility === 'private') return false;
  const effective = await effectivePrincipalIds(
    pool,
    input.workspaceId,
    input.principalId,
  );
  return access.shares.some((share) => effective.includes(share.principalId));
}

/** Filter record ids down to those visible to the principal. */
export async function filterVisibleRecordIds(
  pool: Pool,
  input: {
    workspaceId: string;
    collectionId: string;
    recordIds: string[];
    principalId: string;
  },
): Promise<string[]> {
  if (input.recordIds.length === 0) return [];
  const visible: string[] = [];
  for (const recordId of input.recordIds) {
    if (
      await canViewPage(pool, {
        workspaceId: input.workspaceId,
        collectionId: input.collectionId,
        recordId,
        principalId: input.principalId,
      })
    ) {
      visible.push(recordId);
    }
  }
  return visible;
}
