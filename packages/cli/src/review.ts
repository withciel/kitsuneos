import {
  type JsonValue,
  KitsuneEngine,
  type ReviewDecision,
} from '@kitsuneos/core';
import { APP_URL, OWNER_URL } from './postgres.js';
import { resolveCliWorkspace } from './workspace.js';

function age(fromIso: string): string {
  const from = new Date(fromIso);
  const seconds = Math.max(0, Math.round((Date.now() - from.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

function render(value: JsonValue | undefined | null): string {
  if (value === null || value === undefined) return '(empty)';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
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
      const changeSets = await engine.listChangeSetSummaries(
        workspaceId,
        principalId,
        { scope: 'open', includeReviewComments: true },
      );
      if (changeSets.length === 0) {
        console.log('No open change sets.\n');
        console.log(
          'Ask your agent to propose one, then run `pnpm review` again.',
        );
        return;
      }
      console.log(`${changeSets.length} open change set(s)`);
      for (const changeSet of changeSets) {
        printChangeSet(changeSet);
      }
      console.log('\nApprove with: pnpm review <change-set-id> approve');
      return;
    }

    const found = await engine.listChangeSetSummaries(
      workspaceId,
      principalId,
      {
        changeSetId,
        includeReviewComments: true,
      },
    );
    const changeSet = found[0];
    if (!changeSet) {
      console.error(`No change set ${changeSetId} in this workspace.`);
      process.exitCode = 1;
      return;
    }

    if (!action) {
      printChangeSet(changeSet);
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

    const targetOps =
      explicitOpIds.length > 0
        ? explicitOpIds
        : changeSet.operations.map((o) => o.id);
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

    if (await engine.changeSetHasProposedOps(workspaceId, changeSet.id)) {
      console.log(
        `operation(s) still undecided; apply requires a decision on every operation.`,
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
      const touched = changeSet.operations.find((o) => o.recordId);
      if (touched) {
        console.log(`  pnpm history ${touched.collection} ${touched.recordId}`);
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

function printChangeSet(
  changeSet: Awaited<
    ReturnType<KitsuneEngine['listChangeSetSummaries']>
  >[number],
): void {
  console.log(`\nchange set ${changeSet.id}`);
  console.log(`  ${changeSet.title ?? '(untitled)'}`);
  console.log(
    `  by ${changeSet.author}, ${age(changeSet.createdAt)}, status ${changeSet.status}`,
  );
  if (changeSet.rationale) {
    console.log(`  rationale: ${changeSet.rationale}`);
  }

  const byRecord = new Map<string, typeof changeSet.operations>();
  for (const op of changeSet.operations) {
    const key = `${op.collection}:${op.recordId ?? 'new'}`;
    byRecord.set(key, [...(byRecord.get(key) ?? []), op]);
  }

  for (const [key, group] of byRecord) {
    console.log(`\n  ${key}`);
    for (const op of group) {
      if (op.op === 'delete') {
        console.log(`    [${op.status}] delete whole record   (op ${op.id})`);
        continue;
      }
      console.log(`    [${op.status}] ${op.fieldName}`);
      console.log(`        - ${render(op.before)}`);
      console.log(`        + ${render(op.newValue)}`);
      console.log(`      (op ${op.id})`);
      if (op.reviewComment) {
        console.log(`      comment: ${op.reviewComment}`);
      }
    }
  }
}
