import {
  type JsonValue,
  KitsuneEngine,
  type ReviewDecision,
} from '@kitsuneos/core';
import { APP_URL, OWNER_URL } from './postgres.js';
import { resolveCliWorkspace } from './workspace.js';

interface ChangeSetRow {
  id: string;
  title: string | null;
  rationale: string | null;
  status: string;
  created_at: Date;
  author: string;
}

interface OpRow {
  id: string;
  collection: string;
  record_id: string | null;
  op: string;
  field_name: string | null;
  new_value: JsonValue;
  status: string;
  review_comment: string | null;
  seq: number;
}

function age(from: Date): string {
  const seconds = Math.max(0, Math.round((Date.now() - from.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

function render(value: JsonValue | undefined): string {
  if (value === null || value === undefined) return '(empty)';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

async function listChangeSets(engine: KitsuneEngine): Promise<ChangeSetRow[]> {
  const { workspaceId } = resolveCliWorkspace();
  const result = await engine.ownerPool.query<ChangeSetRow>(
    `SELECT cs.id, cs.title, cs.rationale, cs.status, cs.created_at,
            p.display_name AS author
       FROM kitsune.change_sets cs
       JOIN kitsune.principals p ON p.id = cs.author_id
      WHERE cs.workspace_id = $1 AND cs.status = 'open'
      ORDER BY cs.created_at`,
    [workspaceId],
  );
  return result.rows;
}

async function loadOps(
  engine: KitsuneEngine,
  changeSetId: string,
): Promise<OpRow[]> {
  const result = await engine.ownerPool.query<OpRow>(
    `SELECT o.id, c.name AS collection, o.record_id, o.op, o.field_name,
            o.new_value, o.status, o.review_comment, o.seq
       FROM kitsune.change_ops o
       JOIN kitsune.collections c ON c.id = o.collection_id
      WHERE o.change_set_id = $1
      ORDER BY o.seq`,
    [changeSetId],
  );
  return result.rows;
}

/**
 * Current values are read back through the engine as the reviewer, so the diff
 * shown here is subject to the same authorization as any other read.
 */
async function currentValue(
  engine: KitsuneEngine,
  collection: string,
  recordId: string,
  field: string,
): Promise<JsonValue | undefined> {
  const { workspaceId, principalId } = resolveCliWorkspace();
  const record = await engine.readRecord(
    workspaceId,
    principalId,
    collection,
    recordId,
    [field],
  );
  return record?.[field];
}

async function showChangeSet(
  engine: KitsuneEngine,
  changeSet: ChangeSetRow,
): Promise<void> {
  console.log(`\nchange set ${changeSet.id}`);
  console.log(`  ${changeSet.title ?? '(untitled)'}`);
  console.log(
    `  by ${changeSet.author}, ${age(changeSet.created_at)}, status ${changeSet.status}`,
  );
  if (changeSet.rationale) {
    console.log(`  rationale: ${changeSet.rationale}`);
  }

  const ops = await loadOps(engine, changeSet.id);
  const byRecord = new Map<string, OpRow[]>();
  for (const op of ops) {
    const key = `${op.collection}:${op.record_id ?? 'new'}`;
    byRecord.set(key, [...(byRecord.get(key) ?? []), op]);
  }

  for (const [key, group] of byRecord) {
    console.log(`\n  ${key}`);
    for (const op of group) {
      if (op.op === 'delete') {
        console.log(`    [${op.status}] delete whole record   (op ${op.id})`);
        continue;
      }
      const before =
        op.op === 'insert' || !op.record_id || !op.field_name
          ? undefined
          : await currentValue(
              engine,
              op.collection,
              op.record_id,
              op.field_name,
            );
      console.log(`    [${op.status}] ${op.field_name}`);
      console.log(`        - ${render(before)}`);
      console.log(`        + ${render(op.new_value)}`);
      console.log(`      (op ${op.id})`);
      if (op.review_comment) {
        console.log(`      comment: ${op.review_comment}`);
      }
    }
  }
}

function usage(): void {
  console.log(`Usage:
  pnpm review                              list open change sets with field-level diffs
  pnpm review <change-set-id>              show one change set
  pnpm review <change-set-id> approve      approve every operation, then apply
  pnpm review <change-set-id> reject       reject every operation
  pnpm review <change-set-id> approve <op-id> [<op-id>...]
  pnpm review <change-set-id> reject  <op-id> [<op-id>...] [--comment "why"]
`);
}

export async function review(args: string[]): Promise<void> {
  if (args[0] === '--help' || args[0] === '-h') {
    usage();
    return;
  }

  const { workspaceId, principalId } = resolveCliWorkspace();
  const engine = new KitsuneEngine({
    config: { ownerUrl: OWNER_URL, appUrl: APP_URL },
  });
  try {
    const [changeSetId, action, ...rest] = args;

    if (!changeSetId) {
      const changeSets = await listChangeSets(engine);
      if (changeSets.length === 0) {
        console.log('No open change sets.\n');
        console.log(
          'Ask your agent to propose one, then run `pnpm review` again.',
        );
        return;
      }
      console.log(`${changeSets.length} open change set(s)`);
      for (const changeSet of changeSets) {
        await showChangeSet(engine, changeSet);
      }
      console.log('\nApprove with: pnpm review <change-set-id> approve');
      return;
    }

    const changeSets = await engine.ownerPool.query<ChangeSetRow>(
      `SELECT cs.id, cs.title, cs.rationale, cs.status, cs.created_at,
              p.display_name AS author
         FROM kitsune.change_sets cs
         JOIN kitsune.principals p ON p.id = cs.author_id
        WHERE cs.id = $1 AND cs.workspace_id = $2`,
      [changeSetId, workspaceId],
    );
    const changeSet = changeSets.rows[0];
    if (!changeSet) {
      console.error(`No change set ${changeSetId} in this workspace.`);
      process.exitCode = 1;
      return;
    }

    if (!action) {
      await showChangeSet(engine, changeSet);
      return;
    }

    if (action !== 'approve' && action !== 'reject') {
      usage();
      process.exitCode = 1;
      return;
    }

    const commentIndex = rest.indexOf('--comment');
    const comment = commentIndex >= 0 ? rest[commentIndex + 1] : undefined;
    const explicitOpIds = (
      commentIndex >= 0 ? rest.slice(0, commentIndex) : rest
    ).filter(Boolean);

    const ops = await loadOps(engine, changeSet.id);
    const targetOps =
      explicitOpIds.length > 0 ? explicitOpIds : ops.map((o) => o.id);
    const status = action === 'approve' ? 'approved' : 'rejected';

    const decisions: ReviewDecision[] = targetOps.map((opId) => ({
      opId,
      status,
      ...(comment ? { comment } : {}),
    }));

    for (const decision of decisions) {
      await engine.reviewChangeSet(workspaceId, principalId, changeSet.id, [
        decision,
      ]);
    }
    console.log(`${status} ${decisions.length} operation(s)`);

    if (action === 'reject') {
      return;
    }

    const remaining = (await loadOps(engine, changeSet.id)).filter(
      (o) => o.status === 'proposed',
    );
    if (remaining.length > 0) {
      console.log(
        `${remaining.length} operation(s) still undecided; apply requires a decision on every operation.`,
      );
      return;
    }

    const result = await engine.applyChangeSet(
      workspaceId,
      principalId,
      changeSet.id,
    );
    if (result.status === 'applied') {
      console.log('applied');
      console.log('\nSee the attributed revision with:');
      const touched = ops.find((o) => o.record_id);
      if (touched) {
        console.log(
          `  pnpm history ${touched.collection} ${touched.record_id}`,
        );
      }
    } else if (result.status === 'blocked') {
      console.log(
        `blocked on conflicting field(s): ${result.conflicts?.join(', ')}`,
      );
    } else {
      console.log(result.status);
    }
  } finally {
    await engine.close();
  }
}
