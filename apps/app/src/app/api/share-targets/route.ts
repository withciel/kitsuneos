import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import { requireWorkspace } from '@/lib/require-workspace';

/**
 * People + teams a member can share pages with (any workspace member).
 * Admin-only /api/people stays for invite/role management.
 */
export async function GET() {
  try {
    const ctx = await requireWorkspace();
    const [people, teams] = await Promise.all([
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
      ],
    });
  } catch (error) {
    return jsonError(error);
  }
}
