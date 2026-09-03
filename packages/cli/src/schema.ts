import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type CollectionDefinition, KitsuneEngine } from '@kitsuneos/core';
import { APP_URL, OWNER_URL } from './postgres.js';
import { resolveCliWorkspace } from './workspace.js';

interface SchemaFile {
  collections: CollectionDefinition[];
}

export function loadSchemaFile(cwd = process.cwd()): SchemaFile {
  const path = resolve(cwd, 'kitsune.schema.json');
  return JSON.parse(readFileSync(path, 'utf8')) as SchemaFile;
}

export async function schemaDiff(
  engine: KitsuneEngine,
  cwd = process.cwd(),
): Promise<string[]> {
  const file = loadSchemaFile(cwd);
  const { workspaceId, principalId } = resolveCliWorkspace();
  const live = await engine.describeSchema(workspaceId, principalId);
  const lines: string[] = [];
  const liveByName = new Map(live.collections.map((c) => [c.name, c]));
  for (const collection of file.collections) {
    const existing = liveByName.get(collection.name);
    if (!existing) {
      lines.push(`+ collection ${collection.name}`);
      continue;
    }
    for (const field of collection.fields) {
      if (!existing.fields.some((f) => f.name === field.name)) {
        lines.push(`+ ${collection.name}.${field.name}`);
      }
    }
    for (const field of existing.fields) {
      if (!collection.fields.some((f) => f.name === field.name)) {
        lines.push(`- ${collection.name}.${field.name}`);
      }
    }
  }
  for (const liveCollection of live.collections) {
    if (!file.collections.some((c) => c.name === liveCollection.name)) {
      lines.push(`(live-only collection ${liveCollection.name})`);
    }
  }
  return lines;
}

export async function schemaPush(
  engine: KitsuneEngine,
  cwd = process.cwd(),
): Promise<void> {
  const file = loadSchemaFile(cwd);
  const { workspaceId, principalId } = resolveCliWorkspace();
  const live = await engine.describeSchema(workspaceId, principalId);
  const liveNames = new Set(live.collections.map((c) => c.name));

  for (const collection of file.collections) {
    if (!liveNames.has(collection.name)) {
      await engine.defineCollection(workspaceId, collection);
      console.log(`created collection ${collection.name}`);
      continue;
    }
    const existing = live.collections.find((c) => c.name === collection.name);
    const liveFields = new Set(existing?.fields.map((f) => f.name) ?? []);
    for (const field of collection.fields) {
      if (!liveFields.has(field.name)) {
        const preview = await engine.previewSchemaChange(
          workspaceId,
          principalId,
          { collection: collection.name, op: 'addField', field },
        );
        await engine.applySchemaChange(workspaceId, principalId, {
          collection: collection.name,
          op: 'addField',
          field,
          confirmStaleIds: preview.incompatibleChangeSetIds,
        });
        console.log(`added ${collection.name}.${field.name}`);
      }
    }
    for (const liveField of existing?.fields ?? []) {
      if (!collection.fields.some((f) => f.name === liveField.name)) {
        const preview = await engine.previewSchemaChange(
          workspaceId,
          principalId,
          {
            collection: collection.name,
            op: 'dropField',
            fieldName: liveField.name,
          },
        );
        await engine.applySchemaChange(workspaceId, principalId, {
          collection: collection.name,
          op: 'dropField',
          fieldName: liveField.name,
          confirmStaleIds: preview.incompatibleChangeSetIds,
        });
        console.log(`dropped ${collection.name}.${liveField.name}`);
      }
    }
  }
}

export async function schemaCommand(args: string[]): Promise<void> {
  const engine = new KitsuneEngine({
    config: { ownerUrl: OWNER_URL, appUrl: APP_URL },
  });
  try {
    const sub = args[0];
    if (sub === 'diff') {
      const lines = await schemaDiff(engine);
      if (lines.length === 0) {
        console.log('Schema matches kitsune.schema.json');
        return;
      }
      for (const line of lines) {
        console.log(line);
      }
      return;
    }
    if (sub === 'push') {
      await schemaPush(engine);
      return;
    }
    console.log('Usage: kitsuneos schema diff | kitsuneos schema push');
    process.exitCode = 1;
  } finally {
    await engine.close();
  }
}
