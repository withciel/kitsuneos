#!/usr/bin/env node
import { DEFAULT_CONFIG, KitsuneEngine } from '@kitsuneos/core';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { parseJsonArgs } from './handlers.js';
import { invokeMcpTool, isKitsuneError } from './invoke.js';
import { TOOL_DEFINITIONS } from './schemas.js';

const workspaceId = process.env.KITSUNE_WORKSPACE_ID ?? '';
const principalId = process.env.KITSUNE_PRINCIPAL_ID ?? '';

if (!workspaceId || !principalId) {
  console.error(
    'KITSUNE_WORKSPACE_ID and KITSUNE_PRINCIPAL_ID must be set. Run `pnpm quickstart` to print a ready-made config block.',
  );
  process.exit(1);
}

const engine = new KitsuneEngine({ config: DEFAULT_CONFIG });
const context = { workspaceId, principalId };

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
    const result = await invokeMcpTool(
      engine,
      context,
      request.params.name,
      args as Record<string, unknown>,
    );
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: isKitsuneError(error)
            ? JSON.stringify(
                { error: error.code, message: error.message, ...error.details },
                null,
                2,
              )
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
