'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { statusTone } from '@/components/changes/checks-strip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { summarizePagesTouched } from '@/lib/group-ops-by-page';
import { markChangesSeen } from '@/lib/onboarding';
import { cn } from '@/lib/utils';

interface ChangeSetSummary {
  id: string;
  title: string | null;
  rationale: string | null;
  status: string;
  createdAt: string;
  author: string;
  operations: Array<{ collection: string; recordId?: string | null }>;
}

type Tab = 'open' | 'closed';

export default function ChangesPage() {
  const [items, setItems] = useState<ChangeSetSummary[] | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('open');

  useEffect(() => {
    markChangesSeen();
    void fetch('/api/review?scope=all')
      .then(async (response) => {
        const body = (await response.json()) as {
          changeSets?: ChangeSetSummary[];
          error?: string;
        };
        if (!response.ok) {
          setError(body.error ?? 'Failed to load changes');
          return;
        }
        setItems(body.changeSets ?? []);
      })
      .catch(() => setError('Failed to load changes'));
  }, []);

  const { open, closed } = useMemo(() => {
    const all = items ?? [];
    return {
      open: all.filter((item) => item.status === 'open'),
      closed: all.filter((item) => item.status !== 'open'),
    };
  }, [items]);

  const visible = tab === 'open' ? open : closed;

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight">Changes</h1>
        <p className="text-xs text-muted-foreground">
          Change requests from people and AI helpers — review, comment, and
          merge approved operations.
        </p>
        <div className="mt-3 flex gap-1">
          <button
            type="button"
            onClick={() => setTab('open')}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium',
              tab === 'open'
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50',
            )}
          >
            Open ({open.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('closed')}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium',
              tab === 'closed'
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50',
            )}
          >
            Closed ({closed.length})
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto px-6 py-4">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : items === null ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : visible.length === 0 ? (
          tab === 'open' ? (
            <div className="mx-auto flex max-w-md flex-col items-start gap-4 py-6">
              <div className="space-y-2">
                <p className="text-sm font-medium tracking-tight">
                  Changes is where agent proposals land
                </p>
                <p className="text-sm text-muted-foreground">
                  When an AI helper suggests a change, it shows up here for you
                  to approve, comment on, or reject — nothing writes until you
                  say so. Empty is normal until you connect a helper and ask it
                  to update a page.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link href="/settings/connect">Connect an AI helper</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/">Open a database</Link>
                </Button>
              </div>
            </div>
          ) : (
            <p className="py-6 text-sm text-muted-foreground">
              No closed change requests yet.
            </p>
          )
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Opened</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((item) => {
                const scope = summarizePagesTouched(item.operations);
                const databases = [
                  ...new Set(item.operations.map((op) => op.collection)),
                ];
                const href = `/changes/${item.id}`;
                const tone = statusTone(item.status);
                return (
                  <TableRow key={item.id} className="group">
                    <TableCell>
                      <Link
                        href={href}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {item.title ?? 'Untitled change request'}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {scope.label}
                        {item.rationale ? ` · ${item.rationale}` : ''}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Link href={href}>
                        <Badge variant={tone.variant}>{tone.label}</Badge>
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      <Link
                        href={href}
                        className="block text-foreground hover:text-primary"
                      >
                        {item.author}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={href} className="flex flex-wrap gap-1">
                        {databases.map((name) => (
                          <Badge key={name} variant="secondary">
                            {name}
                          </Badge>
                        ))}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <Link href={href} className="block hover:text-foreground">
                        {new Date(item.createdAt).toLocaleString()}
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
