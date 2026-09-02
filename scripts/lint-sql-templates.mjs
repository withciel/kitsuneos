#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';

const ALLOWED_CALLEES = new Set([
  'quoteIdent',
  'qualifiedTable',
  'revTableName',
  'policySchemaLiteral',
  'escapeSqlStringLiteral',
  'applyLockTimeoutLiteral',
  'aggFnSql',
  'assertSortDirection',
]);

const SAFE_IDENTIFIERS = new Set([
  'whereClause',
  'groupClause',
  'orderClause',
  'limitClause',
  'offsetClause',
  'whereParts',
  'selectParts',
  'selectCols',
  'columnDefs',
  'table',
  'revTable',
  'qSchema',
  'qTable',
  'qRev',
  'readCols',
  'sets',
  'vals',
  'cols',
  'idx',
  'paramIdx',
  'alias',
  'col',
  'def',
  'values',
  'stmts',
  'DEMO_SCHEMA_NAME',
]);

function looksLikeSql(templateText) {
  return (
    /^\s*(SELECT|INSERT|UPDATE|DELETE|SET|CREATE|ALTER|DROP|BEGIN|COMMIT|ROLLBACK)\b/i.test(
      templateText,
    ) ||
    /\bFROM\s+\$\{/i.test(templateText) ||
    /\bWHERE\s+/i.test(templateText) ||
    /\bVALUES\s*\(/i.test(templateText) ||
    /\bSET\s+LOCAL\b/i.test(templateText)
  );
}

const ROOTS = [
  'packages/core/src',
  'packages/cli/src',
  'packages/mcp/src',
  'packages/server/src',
  'packages/provisioning/src',
];

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(path);
    }
    return entry.isFile() && path.endsWith('.ts') ? [path] : [];
  });
}

function hasSqlSafeComment(sourceFile, node) {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  const lines = sourceFile.text.split('\n');
  const lineText = lines[line] ?? '';
  const prevLineText = lines[line - 1] ?? '';
  return (
    /\/\/\s*sql-safe:/.test(lineText) || /\/\/\s*sql-safe:/.test(prevLineText)
  );
}

function isExcludedContext(node) {
  let current = node.parent;
  while (current) {
    if (ts.isNewExpression(current) && ts.isIdentifier(current.expression)) {
      if (
        current.expression.text === 'KitsuneError' ||
        current.expression.text === 'Error'
      ) {
        return true;
      }
    }
    if (ts.isCallExpression(current)) {
      const expr = current.expression;
      if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'log') {
        return true;
      }
    }
    current = current.parent;
  }
  return false;
}

function isMapJoinChain(node) {
  if (!ts.isCallExpression(node)) {
    return false;
  }
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }
  if (node.expression.name.text !== 'join') {
    return false;
  }
  const receiver = node.expression.expression;
  if (ts.isIdentifier(receiver) && SAFE_IDENTIFIERS.has(receiver.text)) {
    return true;
  }
  return (
    ts.isCallExpression(receiver) &&
    ts.isPropertyAccessExpression(receiver.expression) &&
    receiver.expression.name.text === 'map'
  );
}

function isDisallowedExpression(node) {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression)
  ) {
    if (node.expression.name.text === 'toUpperCase') {
      return true;
    }
  }
  if (ts.isPropertyAccessExpression(node)) {
    if (node.name.text === 'schemaName' || node.name.text === 'principalId') {
      return true;
    }
  }
  return false;
}

function isAllowedExpression(node, sourceFile) {
  if (isDisallowedExpression(node)) {
    return false;
  }
  if (hasSqlSafeComment(sourceFile, node)) {
    return true;
  }

  if (ts.isNumericLiteral(node)) {
    return true;
  }

  if (ts.isIdentifier(node)) {
    if (SAFE_IDENTIFIERS.has(node.text)) {
      return true;
    }
    if (/^[A-Z][A-Z0-9_]*$/.test(node.text)) {
      return true;
    }
  }

  if (ts.isPropertyAccessExpression(node) && node.name.text === 'sql') {
    return true;
  }

  if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) {
    return isAllowedExpression(node.operand, sourceFile);
  }

  if (ts.isCallExpression(node)) {
    if (
      ts.isIdentifier(node.expression) &&
      ALLOWED_CALLEES.has(node.expression.text)
    ) {
      return true;
    }
    if (isMapJoinChain(node)) {
      return true;
    }
  }

  return false;
}

function checkSqlTemplate(node, sourceFile, violations) {
  if (isExcludedContext(node)) {
    return;
  }
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return;
  }
  if (!ts.isTemplateExpression(node)) {
    return;
  }

  const templateText =
    node.head.text +
    node.templateSpans.map((span) => span.literal.text).join('');

  for (const span of node.templateSpans) {
    if (isDisallowedExpression(span.expression)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(
        span.expression.getStart(),
      );
      violations.push({
        file: sourceFile.fileName,
        line: line + 1,
        expr: span.expression.getText(sourceFile),
      });
      continue;
    }
    if (!looksLikeSql(templateText)) {
      continue;
    }
    if (!isAllowedExpression(span.expression, sourceFile)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(
        span.expression.getStart(),
      );
      violations.push({
        file: sourceFile.fileName,
        line: line + 1,
        expr: span.expression.getText(sourceFile),
      });
    }
  }
}

function checkFile(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const violations = [];

  function visit(node, parent) {
    node.parent = parent;
    if (ts.isTemplateExpression(node)) {
      checkSqlTemplate(node, sourceFile, violations);
    }
    ts.forEachChild(node, (child) => visit(child, node));
  }

  visit(sourceFile, undefined);
  return violations;
}

const allViolations = [];
let fileCount = 0;

for (const root of ROOTS) {
  const dir = resolve(root);
  for (const file of walk(dir)) {
    fileCount += 1;
    allViolations.push(...checkFile(file));
  }
}

if (fileCount === 0) {
  console.error('SQL template lint: no files scanned');
  process.exit(1);
}

if (allViolations.length > 0) {
  console.error('SQL template literal violations:');
  for (const violation of allViolations) {
    console.error(`  ${violation.file}:${violation.line}: ${violation.expr}`);
  }
  process.exit(1);
}

console.log(`SQL template lint passed (${fileCount} files)`);
