import { KitsuneError } from '@kitsuneos/core';
import { engine } from '@/lib/engine';
import {
  consumePendingApiKey,
  requireWorkspace,
} from '@/lib/require-workspace';
import type {
  WorkspaceMe,
  WorkspaceSchema,
  WorkspaceSchemaCollection,
  WorkspaceSessionSnapshot,
} from '@/lib/workspace-session';

async function loadMeSnapshot(): Promise<WorkspaceMe> {
  const ctx = await requireWorkspace();
  const pendingRaw =
    ctx.apiKeyPlaintext ?? (await consumePendingApiKey(ctx.userId));

  let connectKeyPlaintext: string | null = null;
  if (pendingRaw) {
    try {
      const resolved = await engine.resolveApiKey(pendingRaw);
      const assistantId = await engine.findAssistantPrincipalId(
        ctx.workspaceId,
      );
      if (assistantId && resolved.principalId === assistantId) {
        connectKeyPlaintext = pendingRaw;
      } else {
        await engine.revokeApiKeysForPrincipal(resolved.principalId);
      }
    } catch {
      // Invalid/stale pending value — ignore for Connect.
    }
  }

  const [assistantKeyCount, email] = await Promise.all([
    engine.countActiveAssistantKeys(ctx.workspaceId),
    engine.getUserEmail(ctx.userId),
  ]);
  const hasApiKey = Boolean(connectKeyPlaintext) || assistantKeyCount > 0;

  return {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    principalId: ctx.principalId,
    role: ctx.role,
    email,
    apiKeyPlaintext: connectKeyPlaintext,
    hasApiKey,
  };
}

async function loadSchemaSnapshot(
  workspaceId: string,
  principalId: string,
): Promise<WorkspaceSchema> {
  const schema = await engine.describeSchema(workspaceId, principalId);
  return {
    collections: (schema.collections ?? []) as WorkspaceSchemaCollection[],
  };
}

/**
 * Server-side session load for the console shell (no HTTP loopback).
 */
export async function loadWorkspaceSession(): Promise<WorkspaceSessionSnapshot> {
  try {
    const me = await loadMeSnapshot();
    const [schema, openSets] = await Promise.all([
      loadSchemaSnapshot(me.workspaceId, me.principalId ?? ''),
      engine.listChangeSetSummaries(me.workspaceId, me.principalId ?? '', {
        scope: 'open',
      }),
    ]);
    return {
      me,
      schema,
      openChangeSetCount: openSets.length,
      error: null,
      unauthorized: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const unauthorized =
      (error instanceof KitsuneError && error.code === 'forbidden') ||
      message.includes('Unauthorized');
    return {
      me: null,
      schema: null,
      openChangeSetCount: 0,
      error: unauthorized ? 'Unauthorized' : message,
      unauthorized,
    };
  }
}
