#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve('apps/app/src');
const ALLOWED_FILES = new Set(['require-workspace.ts', 'auth.ts']);

const FORBIDDEN_PATTERNS = [
  /searchParams\.get\(['"]workspace/,
  /params\.workspace/,
  /headers\.get\(['"]x-workspace/,
  /body\.workspace/,
  /workspaceId\s*=\s*request/,
  /workspace_id/,
];

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.isFile() && path.endsWith('.ts') ? [path] : [];
  });
}

const violations = [];
let fileCount = 0;

for (const file of walk(ROOT)) {
  fileCount += 1;
  const base = file.split('/').pop() ?? '';
  if (ALLOWED_FILES.has(base)) continue;
  // Server route handlers may reference workspace_id in SQL; this lint is for
  // client/shared UI code that must not take workspace from the request.
  if (/[/\\]app[/\\]api[/\\]/.test(file)) {
    continue;
  }
  const text = readFileSync(file, 'utf8');
  if (text.includes('// workspace-lint: ignore')) continue;
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) {
      violations.push({ file, pattern: pattern.source });
    }
  }
}

if (fileCount === 0) {
  console.error('Workspace lint: no files scanned in apps/app/src');
  process.exit(1);
}

if (violations.length > 0) {
  console.error('Workspace-from-client violations:');
  for (const v of violations) {
    console.error(`  ${v.file}: ${v.pattern}`);
  }
  process.exit(1);
}

console.log(`Workspace-from-client lint passed (${fileCount} files)`);
