import type { KitsuneEngine } from '@kitsuneos/core';
import { KitsuneError } from '@kitsuneos/core';
import type { McpContext } from './handlers.js';
import { createMcpHandlers } from './handlers.js';

export async function invokeMcpTool(
  engine: KitsuneEngine,
  context: McpContext,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const handlers = createMcpHandlers(engine, () => context);
  switch (toolName) {
    case 'describe_schema':
      return handlers.describe_schema();
    case 'query':
      return handlers.query(args as never);
    case 'read_record':
      return handlers.read_record(args as never);
    case 'search':
      return handlers.search(args as never);
    case 'read_related':
      return handlers.read_related(args as never);
    case 'propose_change_set':
      return handlers.propose_change_set(args as never);
    case 'read_change_set_feedback':
      return handlers.read_change_set_feedback(args as never);
    case 'review_change_set':
      return handlers.review_change_set(args as never);
    case 'apply_change_set':
      return handlers.apply_change_set(args as never);
    case 'define_collection':
      return handlers.define_collection(args as never);
    default:
      throw new KitsuneError(`Unknown tool: ${toolName}`, 'validation');
  }
}

export function isKitsuneError(error: unknown): error is KitsuneError {
  return error instanceof KitsuneError;
}
