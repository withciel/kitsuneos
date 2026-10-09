import { syncWorkspaceToWorkOS } from '@kitsuneos/provisioning';
import { generateAdminPortalLink, isWorkOSConfigured } from '@kitsuneos/workos';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import {
  requireWorkspace,
  requireWorkspaceAdmin,
} from '@/lib/require-workspace';

const INTENTS = [
  'sso',
  'dsync',
  'audit_logs',
  'log_streams',
  'domain_verification',
] as const;

/**
 * Generate a WorkOS Admin Portal link for SSO / Directory Sync / Audit Logs.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireWorkspace();
    requireWorkspaceAdmin(ctx);

    if (!isWorkOSConfigured()) {
      return NextResponse.json(
        { error: 'WorkOS is not configured' },
        { status: 503 },
      );
    }

    const body = (await request.json()) as {
      intent?: string;
      returnUrl?: string;
    };
    const intent = body.intent ?? 'sso';
    if (!INTENTS.includes(intent as (typeof INTENTS)[number])) {
      return NextResponse.json({ error: 'Invalid intent' }, { status: 400 });
    }

    const workosUserId = await engine.getUserWorkosId(ctx.userId);
    let organizationId = await engine.getWorkspaceWorkosOrganizationId(
      ctx.workspaceId,
    );
    if (!organizationId) {
      organizationId = await syncWorkspaceToWorkOS(engine, {
        workspaceId: ctx.workspaceId,
        name: ctx.email,
        ownerWorkosUserId: workosUserId ?? undefined,
      });
    }
    if (!organizationId) {
      return NextResponse.json(
        { error: 'Could not resolve WorkOS organization' },
        { status: 502 },
      );
    }

    const link = await generateAdminPortalLink({
      organizationId,
      intent,
      returnUrl: body.returnUrl,
    });
    if (!link) {
      return NextResponse.json(
        { error: 'Could not generate Admin Portal link' },
        { status: 502 },
      );
    }

    return NextResponse.json({ link, intent, organizationId });
  } catch (error) {
    return jsonError(error);
  }
}
