#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { DEFAULT_CONFIG, KitsuneEngine, KitsuneError } from '@kitsuneos/core';
import { createMcpHandlers, parseJsonArgs, type McpContext } from './handlers.js';
import { TOOL_DEFINITIONS } from './schemas.js';

const workspaceId = process.env.KITSUNE_WORKSPACE_ID ?? '';
const principalId = process.env.KITSUNE_PRINCIPAL_ID ?? '';

if (!workspaceId || !principalId) {
  console.error(
    'KITSUNE_WORKSPACE_ID and KITSUNE_PRINCIPAL_ID must be set. Run `pnpm quickstart` to print a ready-made config block.',
  );
  process.exit(1);
}

function isKitsuneError(error: unknown): error is KitsuneError {
  return error instanceof KitsuneError;
}

const engine = new KitsuneEngine({ config: DEFAULT_CONFIG });
const getContext = (): McpContext => ({ workspaceId, principalId });
const handlers = createMcpHandlers(engine, getContext);

const server = new Server(
  { name: 'kitsuneos', version: '0.1.0-preview' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFINITIONS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = parseJsonArgs(request.params.arguments);
  try {
    let result: unknown;
    switch (request.params.name) {
      case 'describe_schema':
        result = await handlers.describe_schema();
        break;
      case 'query':
        result = await handlers.query(args as never);
        break;
      case 'read_record':
        result = await handlers.read_record(args as never);
        break;
      case 'propose_change_set':
        result = await handlers.propose_change_set(args as never);
        break;
      case 'read_change_set_feedback':
        result = await handlers.read_change_set_feedback(args as never);
        break;
      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    // A denial is a normal answer, not a transport failure. Hand the agent the
    // reason so it can correct itself instead of retrying blindly.
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: isKitsuneError(error)
            ? JSON.stringify({ error: error.code, message: error.message, ...error.details }, null, 2)
            : `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
