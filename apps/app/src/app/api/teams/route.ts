// workspace-lint: ignore — workspace from requireWorkspace; org tables scoped by workspace_id.

import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import {
  requireWorkspace,
  requireWorkspaceAdmin,
  type WorkspaceContext,
} from '@/lib/require-workspace';

function requireAdmin(ctx: WorkspaceContext): void {
  requireWorkspaceAdmin(ctx);
}

export async function GET() {
  try {
    const ctx = await requireWorkspace();
    await requireAdmin(ctx);
    const [teams, people] = await Promise.all([
      engine.listTeams(ctx.workspaceId),
      engine.listWorkspaceMemberships(ctx.workspaceId),
    ]);
    return NextResponse.json({
      teams,
      people: people.map((person) => ({
        principalId: person.principalId,
        email: person.email,
        displayName: person.email,
        userId: person.userId,
        role: person.role,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('Unauthorized')
      ? 401
      : message.includes('Only workspace admins')
        ? 403
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireWorkspace();
    await requireAdmin(ctx);
    const body = (await request.json()) as {
      action?: 'create' | 'addMember' | 'removeMember';
      name?: string;
      teamId?: string;
      principalId?: string;
    };

    if (body.action === 'create') {
      if (!body.name?.trim()) {
        return NextResponse.json(
          { error: 'Team name is required' },
          { status: 400 },
        );
      }
      const team = await engine.createTeam(
        ctx.workspaceId,
        ctx.principalId,
        body.name,
      );
      return NextResponse.json({ team });
    }

    if (body.action === 'addMember') {
      if (!body.teamId || !body.principalId) {
        return NextResponse.json(
          { error: 'teamId and principalId are required' },
          { status: 400 },
        );
      }
      await engine.addPersonToTeam(ctx.workspaceId, ctx.principalId, {
        teamId: body.teamId,
        principalId: body.principalId,
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'removeMember') {
      if (!body.teamId || !body.principalId) {
        return NextResponse.json(
          { error: 'teamId and principalId are required' },
          { status: 400 },
        );
      }
      await engine.removePersonFromTeam(ctx.workspaceId, ctx.principalId, {
        teamId: body.teamId,
        principalId: body.principalId,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
