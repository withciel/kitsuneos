#!/usr/bin/env node
import { exportWorkspace } from './export.js';
import { history } from './history.js';
import { init } from './init.js';
import { queryCommand } from './query.js';
import { quickstart } from './quickstart.js';
import { review } from './review.js';
import { schemaCommand } from './schema.js';
import { lsCommand, readCommand } from './vfs.js';

const [command, ...args] = process.argv.slice(2);

async function main(): Promise<void> {
  switch (command) {
    case 'quickstart':
      await quickstart();
      return;
    case 'init':
      init();
      return;
    case 'schema':
      await schemaCommand(args);
      return;
    case 'query':
      await queryCommand(args);
      return;
    case 'ls':
      await lsCommand(args);
      return;
    case 'read':
      await readCommand(args);
      return;
    case 'review':
    case 'changesets':
      await review(args);
      return;
    case 'history':
      await history(args);
      return;
    case 'export':
      await exportWorkspace();
      return;
    default:
      console.log(`KitsuneOS CLI

  kitsuneos quickstart                     set up Postgres, migrate, seed the demo workspace
  kitsuneos init                           write kitsune.schema.json and .env.example
  kitsuneos schema diff | push             compare or apply kitsune.schema.json
  kitsuneos query --collection NAME        run an engine query as JSON
  kitsuneos ls [path]                      list virtual filesystem path (grant-filtered)
  kitsuneos read <path> [--json]           read a virtual field file
  kitsuneos changesets                     list and review open change sets
  kitsuneos review [change-set-id] [...]   review and apply pending change sets
  kitsuneos history <collection> <id>      show attributed revision history
  kitsuneos export                         dump grant-filtered schema and rows
`);
      process.exitCode = command ? 1 : 0;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
