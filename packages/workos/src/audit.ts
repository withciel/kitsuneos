import { getWorkOS, isWorkOSConfigured } from './client.js';

/**
 * Security / workspace-settings events only.
 * Do NOT emit collection reads/writes/grants here — those stay in kitsune.audit_log.
 */
export type WorkOSAuditAction =
  | 'workspace.created'
  | 'workspace.member.invited'
  | 'workspace.settings.updated'
  | 'agent.created'
  | 'authentication.sso.configured';

export interface EmitAuditEventInput {
  organizationId: string;
  action: WorkOSAuditAction;
  actor: {
    type: 'user' | 'system';
    id: string;
    name?: string;
  };
  targets: Array<{
    type: string;
    id: string;
    name?: string;
  }>;
  metadata?: Record<string, string>;
  location?: string;
  userAgent?: string;
  idempotencyKey?: string;
}

/**
 * Emit a control-plane event to WorkOS Audit Logs.
 * Kitsune `kitsune.audit_log` remains the data-plane / grant denial trail.
 */
export async function emitAuditEvent(
  input: EmitAuditEventInput,
): Promise<boolean> {
  if (!isWorkOSConfigured()) return false;
  const workos = getWorkOS();
  if (!workos) return false;

  try {
    await workos.auditLogs.createEvent(
      input.organizationId,
      {
        action: input.action,
        occurredAt: new Date(),
        actor: {
          type: input.actor.type,
          id: input.actor.id,
          ...(input.actor.name ? { name: input.actor.name } : {}),
        },
        targets: input.targets.map((t) => ({
          type: t.type,
          id: t.id,
          ...(t.name ? { name: t.name } : {}),
        })),
        context: {
          location: input.location ?? '0.0.0.0',
          ...(input.userAgent ? { userAgent: input.userAgent } : {}),
        },
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
      input.idempotencyKey
        ? { idempotencyKey: input.idempotencyKey }
        : undefined,
    );
    return true;
  } catch (error) {
    console.warn(
      '[workos] emitAuditEvent failed:',
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}
