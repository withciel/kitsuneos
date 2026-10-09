import { getWorkOS, isWorkOSConfigured } from './client.js';
import {
  KITSUNE_AGENT_BLUEPRINT_NAME,
  KITSUNE_AGENT_PERMISSIONS,
} from './roles.js';

let cachedBlueprintId: string | null | undefined;

/**
 * Ensure the environment has a Kitsune agent blueprint (propose+read ceiling).
 */
export async function ensureAgentBlueprint(): Promise<string | null> {
  if (!isWorkOSConfigured()) return null;
  if (cachedBlueprintId) return cachedBlueprintId;
  const workos = getWorkOS();
  if (!workos) return null;

  try {
    const listed = await workos.agents.listBlueprints({ limit: 50 });
    const existing = listed.data.find(
      (bp) => bp.name === KITSUNE_AGENT_BLUEPRINT_NAME,
    );
    if (existing) {
      cachedBlueprintId = existing.id;
      return cachedBlueprintId;
    }
    const created = await workos.agents.createBlueprint({
      name: KITSUNE_AGENT_BLUEPRINT_NAME,
      description:
        'First-party KitsuneOS agents. Permission ceiling is propose+read; field-level grants stay in Kitsune.',
      permissions: [...KITSUNE_AGENT_PERMISSIONS],
      invocableBy: {
        roleSlugs: ['owner', 'admin'],
        organizationIds: [],
      },
      sessionSettings: {
        maxAgeSeconds: 86_400 * 30,
        accessTokenTtlSeconds: 900,
        refreshTokenTtlSeconds: 86_400,
      },
    });
    cachedBlueprintId = created.id;
    return cachedBlueprintId;
  } catch (error) {
    console.warn(
      '[workos] ensureAgentBlueprint failed:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export interface MintAutonomousAgentTokenResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  agentInstanceId: string;
  agentInstanceSessionId: string;
  permissions: string[];
}

/**
 * Mint a short-lived autonomous WorkOS agent token for an organization.
 */
export async function mintAutonomousAgentToken(input: {
  organizationId: string;
  intent?: string;
}): Promise<MintAutonomousAgentTokenResult | null> {
  const blueprintId = await ensureAgentBlueprint();
  const workos = getWorkOS();
  if (!blueprintId || !workos) return null;

  try {
    const token = await workos.agents.mintToken({
      agentBlueprintId: blueprintId,
      type: 'autonomous',
      organizationId: input.organizationId,
      ...(input.intent ? { intent: input.intent } : {}),
    });
    return {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresIn: token.expiresIn,
      agentInstanceId: token.agentInstanceId,
      agentInstanceSessionId: token.agentInstanceSessionId,
      permissions: token.permissions ?? [],
    };
  } catch (error) {
    console.warn(
      '[workos] mintAutonomousAgentToken failed:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/** Test helper. */
export function resetAgentBlueprintCache(): void {
  cachedBlueprintId = undefined;
}
