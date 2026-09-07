'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChecksStrip,
  type ChecksSummary,
} from '@/components/changes/checks-strip';
import { ConversationRail } from '@/components/changes/conversation-rail';
import { ChangeDiff, type DiffOperation } from '@/components/changes/diff-view';
import { FileTree } from '@/components/changes/file-tree';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { groupOpsByPage } from '@/lib/group-ops-by-page';
import { markChangesSeen } from '@/lib/onboarding';

interface ChangeSetSummary {
  id: string;
  title: string | null;
  rationale: string | null;
  status: string;
  createdAt: string;
  author: string;
  conflictCount: number;
  conflictedFields: string[];
  expiresAt: string;
  operations: DiffOperation[];
}

const OPEN_STATUS = 'open';

export default function ChangeDetailPage() {
  const params = useParams<{ changeSetId: string }>();
  const router = useRouter();
  const [item, setItem] = useState<ChangeSetSummary | null>(null);
  const [decisions, setDecisions] = useState<
    Record<string, 'approved' | 'rejected'>
  >({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch('/api/review?scope=all');
    const body = (await response.json()) as {
      changeSets?: ChangeSetSummary[];
      error?: string;
    };
    if (!response.ok) {
      setError(body.error ?? 'Failed to load');
      return;
    }
    const found = (body.changeSets ?? []).find(
      (cs) => cs.id === params.changeSetId,
    );
    if (!found) {
      setError('Change request not found');
      return;
    }
    setItem(found);
    const next: Record<string, 'approved' | 'rejected'> = {};
    for (const op of found.operations) {
      if (op.status === 'approved' || op.status === 'rejected') {
        next[op.id] = op.status;
      }
    }
    setDecisions(next);
  }, [params.changeSetId]);

  useEffect(() => {
    markChangesSeen();
    void load().catch(() => setError('Failed to load'));
  }, [load]);

  const pageGroups = useMemo(
    () => (item ? groupOpsByPage(item.operations) : []),
    [item],
  );

  const checks: ChecksSummary | null = useMemo(() => {
    if (!item) return null;
    const pending = item.operations.filter(
      (op) => !decisions[op.id] && op.status === 'proposed',
    ).length;
    const approved = item.operations.filter(
      (op) => decisions[op.id] === 'approved' || op.status === 'approved',
    ).length;
    const rejected = item.operations.filter(
      (op) => decisions[op.id] === 'rejected' || op.status === 'rejected',
    ).length;
    const conflicted = item.operations.filter(
      (op) => op.status === 'conflicted',
    ).length;
    return {
      status: item.status,
      pending,
      approved,
      rejected,
      conflicted,
      total: item.operations.length,
      conflictedFields: item.conflictedFields,
      expiresAt: item.expiresAt,
    };
  }, [item, decisions]);

  const isOpen = item?.status === OPEN_STATUS;

  async function submit(apply: boolean) {
    if (!item) return;
    const undecided = item.operations.filter((op) => !decisions[op.id]);
    if (apply && undecided.length > 0) {
      const ok = window.confirm(
        `${undecided.length} change${undecided.length === 1 ? '' : 's'} still undecided will be rejected. Continue merging?`,
      );
      if (!ok) return;
    }
    setBusy(true);
    setError('');
    try {
      const payload = {
        changeSetId: item.id,
        decisions: item.operations.map((op) => ({
          opId: op.id,
          status: decisions[op.id] ?? 'rejected',
        })),
        apply,
      };
      const response = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Submit failed');
      if (apply) {
        router.push('/changes');
      } else {
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!item && !error) {
    return (
      <div className="space-y-2 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border px-6 py-4">
        <p className="text-xs text-muted-foreground">
          <button
            type="button"
            className="hover:text-foreground"
            onClick={() => router.push('/changes')}
          >
            Changes
          </button>
          {' / '}
          {item?.id.slice(0, 8)}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          {item?.title ?? 'Change request'}
        </h1>
      </div>

      {error ? (
        <p className="px-6 py-4 text-sm text-destructive">{error}</p>
      ) : null}

      {item && checks ? (
        <>
          <ChecksStrip checks={checks} />
          <div className="flex flex-1 overflow-hidden">
            <div className="hidden w-56 shrink-0 overflow-auto border-r border-border md:block">
              <FileTree groups={pageGroups} decisions={decisions} />
            </div>
            <div className="flex-1 overflow-auto px-6 py-4">
              <ChangeDiff
                groups={pageGroups}
                decisions={decisions}
                readOnly={!isOpen}
                onDecide={(opId, status) =>
                  setDecisions((prev) => ({ ...prev, [opId]: status }))
                }
              />
            </div>
            <div className="hidden w-80 shrink-0 overflow-hidden border-l border-border lg:block">
              <ConversationRail
                changeSetId={item.id}
                author={item.author}
                createdAt={item.createdAt}
                rationale={item.rationale}
              />
            </div>
          </div>
          {isOpen ? (
            <div className="flex gap-2 border-t border-border px-6 py-3">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void submit(false)}
              >
                Save decisions
              </Button>
              <Button disabled={busy} onClick={() => void submit(true)}>
                Merge
              </Button>
              <p className="ml-auto self-center text-xs text-muted-foreground">
                {checks.approved} approved · {checks.rejected} rejected ·{' '}
                {checks.pending} pending
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
