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
    const { people, teams, agents } = await engine.listShareTargets(
      ctx.workspaceId,
      ctx.principalId,
      admin,
    );

    return NextResponse.json({
      targets: [
        ...people.map((row) => ({
          principalId: row.principalId,
          label: row.displayName?.trim() || row.email,
          kind: 'person' as const,
        })),
        ...teams.map((row) => ({
          principalId: row.principalId,
          label: row.name,
          kind: 'team' as const,
        })),
        ...agents.map((row) => ({
          principalId: row.id,
          label: row.displayName,
          kind: 'agent' as const,
        })),
      ],
    });
  } catch (error) {
    return jsonError(error);
  }
}
