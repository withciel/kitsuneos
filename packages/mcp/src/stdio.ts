#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { DEFAULT_CONFIG, KitsuneEngine } from '@kitsuneos/core';
import { createMcpHandlers, parseJsonArgs, type McpContext } from './handlers.js';

const workspaceId = process.env.KITSUNE_WORKSPACE_ID ?? '';
const principalId = process.env.KITSUNE_PRINCIPAL_ID ?? '';

const engine = new KitsuneEngine({ config: DEFAULT_CONFIG });
const getContext = (): McpContext => ({ workspaceId, principalId });
const handlers = createMcpHandlers(engine, getContext);

const server = new Server(
  { name: 'kitsuneos', version: '0.0.1' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: 'describe_schema', description: 'Describe reachable schema for caller', inputSchema: { type: 'object', properties: {} } },
    { name: 'query', description: 'Run an authorized query', inputSchema: { type: 'object', properties: {} } },
    { name: 'read_record', description: 'Read a single record', inputSchema: { type: 'object', properties: {} } },
    { name: 'propose_change_set', description: 'Propose a change set', inputSchema: { type: 'object', properties: {} } },
    { name: 'read_change_set_feedback', description: 'Read reviewer feedback', inputSchema: { type: 'object', properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = parseJsonArgs(request.params.arguments);
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
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
