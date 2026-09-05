import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KitsuneEngine, migrate } from '@kitsuneos/core';
import { DEMO, DEMO_SCHEMA_NAME, provisionDemo } from './demo.js';
import {
  APP_URL,
  ensureRolesAndDatabase,
  ensureVectorExtension,
  OWNER_URL,
  requirePostgres,
} from './postgres.js';

// This file lives at packages/cli/{src,dist}/quickstart.{ts,js}; the repo root is
// three levels up either way, so the printed config does not depend on the cwd.
const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

function step(n: number, message: string): void {
  console.log(`[${n}/5] ${message}`);
}

export async function quickstart(): Promise<void> {
  console.log('KitsuneOS quickstart\n');

  step(1, 'Checking for PostgreSQL');
  requirePostgres();
  console.log('      psql found and the server is accepting connections');

  step(2, 'Ensuring roles and database');
  const roles = ensureRolesAndDatabase();
  ensureVectorExtension();
  console.log(
    roles === 'created'
      ? '      created kitsune_owner, kitsune_app and the kitsune database'
      : '      kitsune_owner, kitsune_app and the kitsune database already exist',
  );

  step(3, 'Running control-plane migrations');
  await migrate({ ownerUrl: OWNER_URL, appUrl: APP_URL });

  const engine = new KitsuneEngine({
    config: { ownerUrl: OWNER_URL, appUrl: APP_URL },
  });
  try {
    step(4, 'Provisioning the demo workspace');
    const { created, skipped } = await provisionDemo(engine);
    if (created.length === 0) {
      console.log(
        `      nothing to do, all ${skipped.length} demo objects already present`,
      );
    } else {
      for (const item of created) {
        console.log(`      created ${item}`);
      }
      if (skipped.length > 0) {
        console.log(
          `      skipped ${skipped.length} objects that already existed`,
        );
      }
    }

    step(5, 'Ready');
    printConnectionDetails();
  } finally {
    await engine.close();
  }
}

function printConnectionDetails(): void {
  const serverPath = resolve(REPO_ROOT, 'packages/mcp/dist/stdio.js');
  if (!existsSync(serverPath)) {
    console.log('      note: run `pnpm build` to produce the MCP server at');
    console.log(`            ${serverPath}`);
  }

  console.log(`
Demo workspace
  workspace id   ${DEMO.workspaceId}
  postgres schema ${DEMO_SCHEMA_NAME}
  owner    (human, admin on everything)        ${DEMO.ownerId}
  assistant (agent, propose on opportunities
             limited to name, stage, next_step) ${DEMO.assistantId}

Collections: accounts, contacts, opportunities (3 accounts, 2 contacts, 3 opportunities seeded)

Connect an agent as "assistant" by pasting this into your MCP client config
(Cursor: .cursor/mcp.json, Claude Desktop: claude_desktop_config.json):

{
  "mcpServers": {
    "kitsuneos": {
      "command": "node",
      "args": ["${serverPath}"],
      "env": {
        "KITSUNE_WORKSPACE_ID": "${DEMO.workspaceId}",
        "KITSUNE_PRINCIPAL_ID": "${DEMO.assistantId}",
        "KITSUNE_APP_URL": "${APP_URL}",
        "KITSUNE_OWNER_URL": "${OWNER_URL}"
      }
    }
  }
}

Next:
  pnpm review                 see pending change sets and approve or reject them
  pnpm history opportunities ${DEMO.opportunities.renewal}
                              see attributed revision history for a record
`);
}
