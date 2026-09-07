import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import { isWorkspaceAdmin, requireWorkspace } from '@/lib/require-workspace';

/**
 * People + teams a member can share pages with (any workspace member).
 * Admin-only /api/people stays for invite/role management.
 * Personal agents are owner-or-admin only (same rule as /api/agents).
 */
export async function GET() {
  try {
    const ctx = await requireWorkspace();
    const admin = isWorkspaceAdmin(ctx.role);
    const [people, teams, agents] = await Promise.all([
      engine.ownerPool.query<{
        principal_id: string;
        email: string;
        display_name: string;
      }>(
        `SELECT m.principal_id, m.email, p.display_name
           FROM kitsune.workspace_memberships m
           JOIN kitsune.principals p ON p.id = m.principal_id
          WHERE m.workspace_id = $1
            AND p.disabled_at IS NULL
          ORDER BY m.email ASC`,
        [ctx.workspaceId],
      ),
      engine.ownerPool.query<{
        principal_id: string;
        name: string;
      }>(
        `SELECT t.principal_id, t.name
           FROM kitsune.teams t
          WHERE t.workspace_id = $1
          ORDER BY t.name ASC`,
        [ctx.workspaceId],
      ),
      engine.ownerPool.query<{
        id: string;
        display_name: string;
        agent_membership: string | null;
        agent_owner_principal_id: string | null;
      }>(
        `SELECT id, display_name, agent_membership, agent_owner_principal_id
           FROM kitsune.principals
          WHERE workspace_id = $1
            AND kind = 'agent'
            AND disabled_at IS NULL
            AND (
              COALESCE(agent_membership, 'workspace') <> 'personal'
              OR agent_owner_principal_id = $2
              OR $3::boolean
            )
          ORDER BY display_name ASC`,
        [ctx.workspaceId, ctx.principalId, admin],
      ),
    ]);

    return NextResponse.json({
      targets: [
        ...people.rows.map((row) => ({
          principalId: row.principal_id,
          label: row.display_name?.trim() || row.email,
          kind: 'person' as const,
        })),
        ...teams.rows.map((row) => ({
          principalId: row.principal_id,
          label: row.name,
          kind: 'team' as const,
        })),
        ...agents.rows.map((row) => ({
          principalId: row.id,
          label: row.display_name,
          kind: 'agent' as const,
        })),
      ],
    });
  } catch (error) {
    return jsonError(error);
  }
}
