'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

interface OperationSummary {
  id: string;
  collection: string;
  recordId: string | null;
  op: string;
  fieldName: string | null;
  newValue: unknown;
  before: unknown | null;
  status: string;
  seq: number;
}

interface ChangeSetSummary {
  id: string;
  title: string | null;
  rationale: string | null;
  status: string;
  createdAt: string;
  author: string;
  operations: OperationSummary[];
}

function renderValue(value: unknown): string {
  if (value === undefined) return '(empty)';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
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
      setError('Change set not found or already closed');
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

  async function submit(apply: boolean) {
    if (!item) return;
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
            Inbox
          </button>
          {' / '}
          Change request
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          {item?.title ?? 'Change set'}
        </h1>
        {item ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {item.author} · {new Date(item.createdAt).toLocaleString()}
          </p>
        ) : null}
      </div>
      <div className="flex-1 space-y-4 overflow-auto px-6 py-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {item?.rationale ? (
          <p className="text-sm text-muted-foreground">{item.rationale}</p>
        ) : null}
        <Separator />
        <ul className="space-y-3">
          {item?.operations.map((op) => (
            <li
              key={op.id}
              className="rounded-md border border-border bg-card p-3"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{op.collection}</Badge>
                <Badge variant="outline">{op.op}</Badge>
                {op.fieldName ? (
                  <span className="font-mono text-xs">{op.fieldName}</span>
                ) : null}
              </div>
              <div className="grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-muted-foreground">Before</p>
                  <pre className="overflow-auto rounded bg-muted/50 p-2 font-mono">
                    {renderValue(op.before)}
                  </pre>
                </div>
                <div>
                  <p className="mb-1 text-muted-foreground">After</p>
                  <pre className="overflow-auto rounded bg-muted/50 p-2 font-mono">
                    {renderValue(op.newValue)}
                  </pre>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant={
                    decisions[op.id] === 'approved' ? 'default' : 'outline'
                  }
                  onClick={() =>
                    setDecisions((prev) => ({ ...prev, [op.id]: 'approved' }))
                  }
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant={
                    decisions[op.id] === 'rejected' ? 'destructive' : 'outline'
                  }
                  onClick={() =>
                    setDecisions((prev) => ({ ...prev, [op.id]: 'rejected' }))
                  }
                >
                  Reject
                </Button>
              </div>
            </li>
          ))}
        </ul>
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
          Submit & apply
        </Button>
      </div>
    </div>
  );
}
