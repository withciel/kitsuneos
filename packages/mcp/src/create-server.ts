import type { KitsuneEngine } from '@kitsuneos/core';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { McpContext } from './handlers.js';
import { parseJsonArgs } from './handlers.js';
import { invokeMcpTool, isKitsuneError } from './invoke.js';
import { TOOL_DEFINITIONS } from './schemas.js';

export interface CreateKitsuneMcpServerOptions {
  engine: KitsuneEngine;
  getContext: () => McpContext | Promise<McpContext>;
  serverInfo?: { name?: string; version?: string };
}

/** Shared MCP server used by stdio and Streamable HTTP transports. */
export function createKitsuneMcpServer(
  options: CreateKitsuneMcpServerOptions,
): Server {
  const server = new Server(
    {
      name: options.serverInfo?.name ?? 'kitsuneos',
      version: options.serverInfo?.version ?? '0.1.0-preview',
    },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = parseJsonArgs(request.params.arguments);
    const context = await options.getContext();
    try {
      const result = await invokeMcpTool(
        options.engine,
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
                  {
                    error: error.code,
                    message: error.message,
                    ...error.details,
                  },
                  null,
                  2,
                )
              : `Unexpected error: ${
                  error instanceof Error ? error.message : String(error)
                }`,
          },
        ],
      };
    }
  });

  return server;
}
