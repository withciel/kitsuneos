import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateClientSource, runCodegen } from '@kitsuneos/codegen';
import { describe, expect, it } from 'vitest';

const fixturePath = resolve(
  process.cwd(),
  '../codegen/fixtures/demo-schema.json',
);

describe('collection codegen', () => {
  it('emits Opportunity with amount from the demo fixture', () => {
    const schema = JSON.parse(readFileSync(fixturePath, 'utf8')) as Parameters<
      typeof generateClientSource
    >[0];
    const source = generateClientSource(schema);
    expect(source).toContain('export interface Opportunity');
    expect(source).toContain('amount?: number | null');
  });

  it('fails --check when a field is dropped from the fixture', () => {
    const original = readFileSync(fixturePath, 'utf8');
    const dropped = original.replace(
      `        { "name": "amount", "type": "number" },\n`,
      '',
    );
    const files = new Map<string, string>([
      [fixturePath, dropped],
      ['/tmp/generated.ts', generateClientSource(JSON.parse(original))],
    ]);
    const result = runCodegen({
      fixturePath,
      outputPath: '/tmp/generated.ts',
      check: true,
      readFile: (path) => {
        const contents = files.get(path);
        if (contents === undefined) {
          throw new Error(`missing ${path}`);
        }
        return contents;
      },
    });
    expect(result.changed).toBe(true);
    expect(result.source).not.toContain('amount?: number | null');
  });
});
