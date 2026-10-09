import type { KitsuneEngine } from '@kitsuneos/core';
import {
  emitAuditEvent,
  inviteToOrganization,
  isWorkOSConfigured,
} from '@kitsuneos/workos';
import { syncWorkspaceToWorkOS } from './sync-workos.js';

export type InviteRole = 'admin' | 'member';

/**
 * Invite a human via WorkOS (source of truth for membership/email), then
 * mirror a pending Kitsune membership/principal for grants until claim.
 */
export async function invitePersonViaWorkOS(
  engine: KitsuneEngine,
  input: {
    workspaceId: string;
    actorUserId: string;
    email: string;
    role: InviteRole;
    displayName?: string;
    workspaceName?: string;
  },
): Promise<{
  membershipId: string;
  principalId: string;
  workosInvitationId: string | null;
}> {
  const ownerWorkosId = await engine.getUserWorkosId(input.actorUserId);
  const orgId =
    (await engine.getWorkspaceWorkosOrganizationId(input.workspaceId)) ??
    (await syncWorkspaceToWorkOS(engine, {
      workspaceId: input.workspaceId,
      name: input.workspaceName ?? input.workspaceId,
      ownerWorkosUserId: ownerWorkosId ?? undefined,
    }));

  let workosInvitationId: string | null = null;
  if (orgId && isWorkOSConfigured() && ownerWorkosId) {
    const invitation = await inviteToOrganization({
      organizationId: orgId,
      email: input.email,
      role: input.role,
      inviterWorkosUserId: ownerWorkosId,
    });
    workosInvitationId = invitation?.invitationId ?? null;
    if (workosInvitationId) {
      await emitAuditEvent({
        organizationId: orgId,
        action: 'workspace.member.invited',
        actor: { type: 'user', id: ownerWorkosId },
        targets: [
          {
            type: 'user',
            id: input.email.trim().toLowerCase(),
            name: input.email,
          },
          { type: 'workspace', id: input.workspaceId },
        ],
        metadata: { role: input.role, source: 'workos_invitation' },
        idempotencyKey: `invite:${input.workspaceId}:${input.email}:${workosInvitationId}`,
      });
    }
  }

  const result = await engine.invitePerson(
    input.workspaceId,
    input.actorUserId,
    {
      email: input.email,
      role: input.role,
      displayName: input.displayName,
    },
  );

  return { ...result, workosInvitationId };
}
