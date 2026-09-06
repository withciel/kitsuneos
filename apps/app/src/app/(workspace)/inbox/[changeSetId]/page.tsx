'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChangeRequestDiff,
  type DiffOperation,
} from '@/components/inbox/change-request-diff';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { groupOpsByPage, summarizePagesTouched } from '@/lib/group-ops-by-page';

interface ChangeSetSummary {
  id: string;
  title: string | null;
  rationale: string | null;
  status: string;
  createdAt: string;
  author: string;
  operations: DiffOperation[];
}

export default function InboxDetailPage() {
  const params = useParams<{ changeSetId: string }>();
  const router = useRouter();
  const [item, setItem] = useState<ChangeSetSummary | null>(null);
  const [decisions, setDecisions] = useState<
    Record<string, 'approved' | 'rejected'>
  >({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch('/api/review');
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
      setError('Change request not found or already closed');
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
    void load().catch(() => setError('Failed to load'));
  }, [load]);

  const pageGroups = useMemo(
    () => (item ? groupOpsByPage(item.operations) : []),
    [item],
  );

  const scope = useMemo(
    () =>
      item
        ? summarizePagesTouched(item.operations)
        : { label: '', pageCount: 0, databaseCount: 0 },
    [item],
  );

  async function submit(apply: boolean) {
    if (!item) return;
    const undecided = item.operations.filter((op) => !decisions[op.id]);
    if (apply && undecided.length > 0) {
      const ok = window.confirm(
        `${undecided.length} change${undecided.length === 1 ? '' : 's'} still undecided will be rejected. Continue applying?`,
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
        router.push('/inbox');
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
            onClick={() => router.push('/inbox')}
          >
            Change requests
          </button>
          {' / '}
          Review
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          {item?.title ?? 'Change request'}
        </h1>
        {item ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {item.author} · {new Date(item.createdAt).toLocaleString()}
            {scope.label ? ` · ${scope.label}` : ''}
          </p>
        ) : null}
      </div>
      <div className="flex-1 space-y-4 overflow-auto px-6 py-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {item?.rationale ? (
          <p className="text-sm text-muted-foreground">{item.rationale}</p>
        ) : null}
        <Separator />
        {item ? (
          <ChangeRequestDiff
            groups={pageGroups}
            decisions={decisions}
            onDecide={(opId, status) =>
              setDecisions((prev) => ({ ...prev, [opId]: status }))
            }
          />
        ) : null}
      </div>
      <div className="flex gap-2 border-t border-border px-6 py-3">
        <Button
          variant="outline"
          disabled={busy || !item}
          onClick={() => void submit(false)}
        >
          Save decisions
        </Button>
        <Button disabled={busy || !item} onClick={() => void submit(true)}>
          Apply approved
        </Button>
        {item ? (
          <p className="ml-auto self-center text-xs text-muted-foreground">
            {
              item.operations.filter((op) => decisions[op.id] === 'approved')
                .length
            }{' '}
            approved ·{' '}
            {
              item.operations.filter((op) => decisions[op.id] === 'rejected')
                .length
            }{' '}
            rejected ·{' '}
            {item.operations.filter((op) => !decisions[op.id]).length} undecided
          </p>
        ) : null}
      </div>
    </div>
  );
}
