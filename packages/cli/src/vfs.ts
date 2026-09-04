import { KitsuneEngine } from '@kitsuneos/core';
import { APP_URL, OWNER_URL } from './postgres.js';
import { resolveCliWorkspace } from './workspace.js';

export async function lsCommand(args: string[]): Promise<void> {
  const path = args[0] ?? '/';
  const engine = new KitsuneEngine({
    config: { ownerUrl: OWNER_URL, appUrl: APP_URL },
  });
  try {
    const { workspaceId, principalId } = resolveCliWorkspace();
    const result = await engine.vfsList(workspaceId, principalId, path);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await engine.close();
  }
}

export async function readCommand(args: string[]): Promise<void> {
  const path = args[0];
  if (!path) {
    console.log(
      'Usage: kitsuneos read /<collection>/<recordId>/<field>.md|json',
    );
    process.exitCode = 1;
    return;
  }
  const engine = new KitsuneEngine({
    config: { ownerUrl: OWNER_URL, appUrl: APP_URL },
  });
  try {
    const { workspaceId, principalId } = resolveCliWorkspace();
    const result = await engine.vfsRead(workspaceId, principalId, path);
    if (args.includes('--json')) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      process.stdout.write(result.content);
      if (!result.content.endsWith('\n')) process.stdout.write('\n');
    }
  } finally {
    await engine.close();
  }
}
