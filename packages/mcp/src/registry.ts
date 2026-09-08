import type { McpHandlers } from './handlers.js';
import { TOOL_DEFINITIONS } from './schemas.js';

export type McpToolName = (typeof TOOL_DEFINITIONS)[number]['name'];
export type McpToolDefinition = (typeof TOOL_DEFINITIONS)[number];

export interface McpToolRegistryEntry {
  definition: McpToolDefinition;
  handlerKey: keyof McpHandlers;
}

type AssertHandlersCoverTools =
  Exclude<McpToolName, keyof McpHandlers> extends never
    ? true
    : Exclude<McpToolName, keyof McpHandlers>;

const _handlersCoverTools: AssertHandlersCoverTools = true;
void _handlersCoverTools;

function buildRegistry(): Record<McpToolName, McpToolRegistryEntry> {
  const registry = {} as Record<McpToolName, McpToolRegistryEntry>;
  for (const definition of TOOL_DEFINITIONS) {
    const name = definition.name;
    registry[name] = {
      definition,
      handlerKey: name as keyof McpHandlers,
    };
  }
  return registry;
}

/** Single source for tool name → definition + handler key. */
export const MCP_TOOL_REGISTRY: Record<McpToolName, McpToolRegistryEntry> =
  buildRegistry();

/** Tool definitions for ListTools — same order as schemas, via the registry. */
export const REGISTRY_TOOL_DEFINITIONS: readonly McpToolDefinition[] =
  TOOL_DEFINITIONS.map(
    (definition) => MCP_TOOL_REGISTRY[definition.name].definition,
  );

export function getMcpToolEntry(
  toolName: string,
): McpToolRegistryEntry | undefined {
  return MCP_TOOL_REGISTRY[toolName as McpToolName];
}
