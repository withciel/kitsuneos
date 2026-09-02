#!/usr/bin/env node
import { history } from './history.js';
import { quickstart } from './quickstart.js';
import { review } from './review.js';

const [command, ...args] = process.argv.slice(2);

async function main(): Promise<void> {
  switch (command) {
    case 'quickstart':
      await quickstart();
      return;
    case 'review':
      await review(args);
      return;
    case 'history':
      await history(args);
      return;
    default:
      console.log(`KitsuneOS CLI

  kitsuneos quickstart                     set up Postgres, migrate, seed the demo workspace
  kitsuneos review [change-set-id] [...]   review and apply pending change sets
  kitsuneos history <collection> <id>      show attributed revision history
`);
      process.exitCode = command ? 1 : 0;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
