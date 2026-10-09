import type { KitsuneEngine } from '@kitsuneos/core';
import {
  emitAuditEvent,
  isWorkOSConfigured,
  mintAutonomousAgentToken,
  registerAgentResource,
} from '@kitsuneos/workos';
import { syncWorkspaceToWorkOS } from './sync-workos.js';

export type AgentMembership = 'workspace' | 'team' | 'personal';

/**
 * Create a Kitsune agent principal, register it as a WorkOS FGA `agent`
 * resource, and mint a short-lived WorkOS Agent Auth token when configured.
 * Kitsune API keys remain available as a local/MCP fallback.
 */
export async function createAgentViaWorkOS(
  engine: KitsuneEngine,
  input: {
    workspaceId: string;
    actorUserId: string;
    actorPrincipalId: string;
    name: string;
    membership: AgentMembership;
    teamId?: string;
    mintKitsuneKey?: boolean;
  },
): Promise<{
  principalId: string;
  workosAgentInstanceId: string | null;
  workosAccessToken: string | null;
  workosRefreshToken: string | null;
  apiKeyPlaintext: string | null;
}> {
  const principalId = await engine.createPrincipal(
    input.workspaceId,
    'agent',
    input.name,
    {
      agentMembership: input.membership,
      agentTeamId: input.membership === 'team' ? input.teamId : undefined,
      agentOwnerPrincipalId:
        input.membership === 'personal' ? input.actorPrincipalId : undefined,
    },
  );

  // Ensure agent_memory collection + write grant (product requirement).
  let memoryCollectionId = await engine.findCollectionId(
    input.workspaceId,
    'agent_memory',
  );
  if (!memoryCollectionId) {
    memoryCollectionId = await engine.defineCollection(input.workspaceId, {
      name: 'agent_memory',
      fields: [
        { name: 'title', type: 'text', nullable: false },
        { name: 'body', type: 'prose' },
      ],
    });
    await engine.createGrant(
      input.workspaceId,
      input.actorPrincipalId,
      memoryCollectionId,
      'admin',
      null,
      null,
      { actorId: input.actorPrincipalId },
    );
  }
  await engine.createGrant(
    input.workspaceId,
    principalId,
    memoryCollectionId,
    'write',
    null,
    null,
    { actorId: input.actorPrincipalId },
  );

  let workosAgentInstanceId: string | null = null;
  let workosAccessToken: string | null = null;
  let workosRefreshToken: string | null = null;

  if (isWorkOSConfigured()) {
    const ownerWorkosId = await engine.getUserWorkosId(input.actorUserId);
    const orgId =
      (await engine.getWorkspaceWorkosOrganizationId(input.workspaceId)) ??
      (await syncWorkspaceToWorkOS(engine, {
        workspaceId: input.workspaceId,
        name: input.name,
        ownerWorkosUserId: ownerWorkosId ?? undefined,
      }));

    if (orgId) {
      await registerAgentResource({
        organizationId: orgId,
        principalId,
        name: input.name,
      });

      const minted = await mintAutonomousAgentToken({
        organizationId: orgId,
        intent: `kitsune-agent:${principalId}`,
      });
      if (minted) {
        workosAgentInstanceId = minted.agentInstanceId;
        workosAccessToken = minted.accessToken;
        workosRefreshToken = minted.refreshToken;
        await engine.setPrincipalWorkosAgentInstanceId(
          principalId,
          minted.agentInstanceId,
        );
      }

      if (ownerWorkosId) {
        await emitAuditEvent({
          organizationId: orgId,
          action: 'agent.created',
          actor: { type: 'user', id: ownerWorkosId },
          targets: [
            { type: 'agent', id: principalId, name: input.name },
            { type: 'user', id: ownerWorkosId },
          ],
          metadata: {
            membership: input.membership,
            workos_instance: workosAgentInstanceId ?? '',
          },
          idempotencyKey: `agent.created:${principalId}`,
        });
      }
    }
  }

  let apiKeyPlaintext: string | null = null;
  if (input.mintKitsuneKey !== false) {
    const key = await engine.createApiKey(principalId);
    apiKeyPlaintext = key.plaintext;
  }

  return {
    principalId,
    workosAgentInstanceId,
    workosAccessToken,
    workosRefreshToken,
    apiKeyPlaintext,
  };
}
