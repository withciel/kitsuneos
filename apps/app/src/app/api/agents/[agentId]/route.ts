import { KitsuneError } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import { isWorkspaceAdmin, requireWorkspace } from '@/lib/require-workspace';

type Params = { params: Promise<{ agentId: string }> };

/** Agent profile: identity, membership, active grants (admin-visible). */
export async function GET(_request: Request, { params }: Params) {
  try {
    const ctx = await requireWorkspace();
    const { agentId } = await params;
    const agent = await engine.ownerPool.query<{
      id: string;
      display_name: string;
      created_at: string;
      key_count: string;
      agent_membership: string | null;
      agent_team_principal_id: string | null;
      agent_owner_principal_id: string | null;
    }>(
      `SELECT p.id, p.display_name, p.created_at::text AS created_at,
              count(k.id) FILTER (WHERE k.revoked_at IS NULL)::text AS key_count,
              p.agent_membership,
              t.principal_id AS agent_team_principal_id,
              p.agent_owner_principal_id
         FROM kitsune.principals p
         LEFT JOIN kitsune.api_keys k ON k.principal_id = p.id
         LEFT JOIN kitsune.teams t ON t.id = p.agent_team_id
        WHERE p.id = $1
          AND p.workspace_id = $2
          AND p.kind = 'agent'
          AND p.disabled_at IS NULL
        GROUP BY p.id, t.principal_id`,
      [agentId, ctx.workspaceId],
    );
    const row = agent.rows[0];
    if (!row) {
      throw new KitsuneError('Agent not found', 'not_found');
    }
    const admin = isWorkspaceAdmin(ctx.role);
    const isOwner = row.agent_owner_principal_id === ctx.principalId;
    if (row.agent_membership === 'personal' && !admin && !isOwner) {
      throw new KitsuneError('Agent not found', 'not_found');
    }

    const canManageAccess = admin;
    const grants = canManageAccess
      ? (
          await engine.ownerPool.query<{
            id: string;
            collection: string;
            capability: string;
            field_mask: string[] | null;
            revoked_at: string | null;
          }>(
            `SELECT g.id, c.name AS collection, g.capability, g.field_mask,
                    g.revoked_at::text AS revoked_at
               FROM kitsune.grants g
               JOIN kitsune.collections c ON c.id = g.collection_id
              WHERE g.workspace_id = $1 AND g.principal_id = $2
              ORDER BY c.name`,
            [ctx.workspaceId, agentId],
          )
        ).rows
          .filter((grant) => !grant.revoked_at)
          .map((grant) => ({
            id: grant.id,
            collection: grant.collection,
            capability: grant.capability,
            fieldMask: grant.field_mask,
          }))
      : [];

    return NextResponse.json({
      agent: {
        id: row.id,
        name: row.display_name,
        createdAt: row.created_at,
        activeKeyCount: Number(row.key_count),
        membership: row.agent_membership ?? 'workspace',
        teamId: row.agent_team_principal_id,
        ownerPrincipalId: row.agent_owner_principal_id,
      },
      canManageAccess,
      grants,
    });
  } catch (error) {
    return jsonError(error);
  }
}
