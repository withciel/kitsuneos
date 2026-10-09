import {
  constructWorkOSWebhookEvent,
  ensureMembership,
  fromWorkOSRoleSlug,
  isWorkOSConfigured,
} from '@kitsuneos/workos';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';

/**
 * WorkOS Events webhook — sync organization memberships into Kitsune.
 * Configure WORKOS_WEBHOOK_SECRET in the environment.
 */
export async function POST(request: Request) {
  if (!isWorkOSConfigured()) {
    return NextResponse.json(
      { error: 'WorkOS not configured' },
      { status: 503 },
    );
  }

  const secret = process.env.WORKOS_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: 'WORKOS_WEBHOOK_SECRET not set' },
      { status: 503 },
    );
  }

  const payload = await request.text();
  const signature =
    request.headers.get('workos-signature') ??
    request.headers.get('WorkOS-Signature') ??
    '';

  const event = await constructWorkOSWebhookEvent(payload, signature, secret);
  if (!event) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    if (
      event.event === 'organization_membership.created' ||
      event.event === 'organization_membership.updated'
    ) {
      const data = event.data as {
        id?: string;
        user_id?: string;
        organization_id?: string;
        role?: { slug?: string };
        status?: string;
      };
      const workosUserId = data.user_id;
      const organizationId = data.organization_id;
      if (workosUserId && organizationId) {
        const user = await engine.findUserByWorkosId(workosUserId);
        const workspace = await engine.ownerPool.query<{ id: string }>(
          `SELECT id FROM kitsune.workspaces WHERE workos_organization_id = $1`,
          [organizationId],
        );
        const workspaceId = workspace.rows[0]?.id;
        if (user && workspaceId && data.status !== 'inactive') {
          // Ensure membership row exists via claim path / invite claim.
          await engine.claimInvitesForUser({
            userId: user.userId,
            email: user.email,
          });
          await ensureMembership({
            organizationId,
            workosUserId,
            role: fromWorkOSRoleSlug(data.role?.slug),
          });
        }
      }
    }

    return NextResponse.json({ received: true, event: event.event });
  } catch (error) {
    console.error('[workos webhook]', error);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }
}
