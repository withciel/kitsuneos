import { syncWorkspaceToWorkOS } from '@kitsuneos/provisioning';
import {
  createWidgetToken,
  isWorkOSConfigured,
  type WidgetTokenScope,
} from '@kitsuneos/workos';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import { isWorkspaceAdmin, requireWorkspace } from '@/lib/require-workspace';

const ADMIN_SCOPES: WidgetTokenScope[] = [
  'widgets:users-table:manage',
  'widgets:sso:manage',
  'widgets:domain-verification:manage',
  'widgets:dsync:manage',
  'widgets:audit-log-streaming:manage',
  'widgets:api-keys:manage',
];

/**
 * Mint a short-lived WorkOS Widgets session token for the active workspace org.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireWorkspace();
    if (!isWorkOSConfigured()) {
      return NextResponse.json(
        { error: 'WorkOS is not configured', token: null },
        { status: 503 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      scopes?: WidgetTokenScope[];
    };

    const workosUserId = await engine.getUserWorkosId(ctx.userId);
    if (!workosUserId) {
      return NextResponse.json(
        { error: 'Missing WorkOS user id' },
        { status: 400 },
      );
    }

    let organizationId = await engine.getWorkspaceWorkosOrganizationId(
      ctx.workspaceId,
    );
    if (!organizationId) {
      organizationId = await syncWorkspaceToWorkOS(engine, {
        workspaceId: ctx.workspaceId,
        name: ctx.email,
        ownerWorkosUserId: workosUserId,
      });
    }
    if (!organizationId) {
      return NextResponse.json(
        { error: 'Could not resolve WorkOS organization' },
        { status: 502 },
      );
    }

    const scopes =
      body.scopes && body.scopes.length > 0
        ? body.scopes
        : isWorkspaceAdmin(ctx.role)
          ? ADMIN_SCOPES
          : [];

    const token = await createWidgetToken({
      organizationId,
      workosUserId,
      scopes,
    });
    if (!token) {
      return NextResponse.json(
        { error: 'Could not mint widget token' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      token,
      organizationId,
      scopes,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET() {
  try {
    const ctx = await requireWorkspace();
    const organizationId = await engine.getWorkspaceWorkosOrganizationId(
      ctx.workspaceId,
    );
    return NextResponse.json({
      configured: isWorkOSConfigured(),
      organizationId,
      admin: isWorkspaceAdmin(ctx.role),
    });
  } catch (error) {
    return jsonError(error);
  }
}
