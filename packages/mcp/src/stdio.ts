#!/usr/bin/env node
import { DEFAULT_CONFIG, KitsuneEngine } from '@kitsuneos/core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createKitsuneMcpServer } from './create-server.js';

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
const server = createKitsuneMcpServer({
  engine,
  getContext: () => context,
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
