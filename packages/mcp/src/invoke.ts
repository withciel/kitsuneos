import type { KitsuneEngine } from '@kitsuneos/core';
import { KitsuneError } from '@kitsuneos/core';
import type { McpContext } from './handlers.js';
import { createMcpHandlers, mcpHandlersDispatch } from './handlers.js';
import { getMcpToolEntry } from './registry.js';

export async function invokeMcpTool(
  engine: KitsuneEngine,
  context: McpContext,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const entry = getMcpToolEntry(toolName);
  if (!entry) {
    throw new KitsuneError(`Unknown tool: ${toolName}`, 'validation');
  }

  const handlers = mcpHandlersDispatch(
    createMcpHandlers(engine, () => context),
  );
  return handlers[entry.handlerKey](args);
}

export function isKitsuneError(error: unknown): error is KitsuneError {
  return error instanceof KitsuneError;
}
