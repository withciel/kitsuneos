import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCodegen } from './index.js';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const defaultFixture = resolve(packageRoot, 'fixtures/demo-schema.json');
const defaultOutput = resolve(packageRoot, '../client/src/generated.ts');

const check = process.argv.includes('--check');
const result = runCodegen({
  fixturePath: defaultFixture,
  outputPath: defaultOutput,
  check,
  readFile: (path) => readFileSync(path, 'utf8'),
  writeFile: (path, contents) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  },
});

if (check && result.changed) {
  console.error('Generated client is out of date. Run `pnpm codegen`.');
  process.exit(1);
}

if (!check) {
  console.log(`Wrote ${defaultOutput}`);
}
