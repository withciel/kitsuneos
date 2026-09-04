import type { IngestSourceKind } from '@kitsuneos/core';
import { KitsuneEngine } from '@kitsuneos/core';
import { parseIngestSource } from './ingest-parse.js';
import { APP_URL, OWNER_URL } from './postgres.js';
import { resolveCliWorkspace } from './workspace.js';

function parseMap(raw: string | undefined): Record<string, string> | undefined {
  if (!raw) return undefined;
  const map: Record<string, string> = {};
  for (const part of raw.split(',')) {
    const [target, source] = part.split('=').map((s) => s.trim());
    if (!target || !source) {
      throw new Error(`Invalid --map entry: ${part} (expected target=source)`);
    }
    map[target] = source;
  }
  return map;
}

export async function ingestCommand(args: string[]): Promise<void> {
  const sourceIdx = args.indexOf('--source');
  const pathIdx = args.indexOf('--path');
  const collectionIdx = args.indexOf('--collection');
  const mapIdx = args.indexOf('--map');
  const modeIdx = args.indexOf('--mode');

  const source = sourceIdx >= 0 ? args[sourceIdx + 1] : undefined;
  const path = pathIdx >= 0 ? args[pathIdx + 1] : undefined;
  const collection = collectionIdx >= 0 ? args[collectionIdx + 1] : undefined;
  const modeRaw = modeIdx >= 0 ? args[modeIdx + 1] : 'auto';

  if (
    !source ||
    !path ||
    !collection ||
    !['cms', 'crm', 'kb', 'tickets'].includes(source)
  ) {
    console.log(`Usage: kitsuneos ingest --source cms|crm|kb|tickets --path <file-or-dir> --collection NAME [--map target=source,...] [--mode auto|propose|direct]

  kb/cms:  markdown folder or .md/.json
  crm/tickets: .csv or .json with optional --map name=Name,email=Email`);
    process.exitCode = 1;
    return;
  }

  const batch = parseIngestSource({
    source: source as IngestSourceKind,
    path,
    collection,
    fieldMap: parseMap(mapIdx >= 0 ? args[mapIdx + 1] : undefined),
  });

  const engine = new KitsuneEngine({
    config: { ownerUrl: OWNER_URL, appUrl: APP_URL },
  });
  try {
    const { workspaceId, principalId } = resolveCliWorkspace();
    const result = await engine.ingest(workspaceId, principalId, {
      collection: batch.collection,
      records: batch.records,
      mode: modeRaw as 'auto' | 'propose' | 'direct',
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.errors.length > 0) process.exitCode = 1;
  } finally {
    await engine.close();
  }
}
