'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { statusTone } from '@/components/changes/checks-strip';
import { OperateEmptyState } from '@/components/operate/empty-state';
import { OperateLoadingBlock } from '@/components/operate/loading-block';
import { OperatePageHeader } from '@/components/operate/page-header';
import { UnderlineTabs } from '@/components/operate/underline-tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
    void Promise.all([
      fetch('/api/review?scope=open'),
      fetch('/api/review?scope=closed'),
    ])
      .then(async ([openRes, closedRes]) => {
        const openBody = (await openRes.json()) as {
          changeSets?: ChangeSetSummary[];
          error?: string;
        };
        const closedBody = (await closedRes.json()) as {
          changeSets?: ChangeSetSummary[];
          error?: string;
        };
        if (!openRes.ok) {
          setError(openBody.error ?? 'Failed to load changes');
          return;
        }
        if (!closedRes.ok) {
          setError(closedBody.error ?? 'Failed to load closed changes');
          return;
        }
        setItems([
          ...(openBody.changeSets ?? []),
          ...(closedBody.changeSets ?? []),
        ]);
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
      <OperatePageHeader
        title="Changes"
        description="Change requests from people and AI helpers — review, comment, and merge approved operations."
      >
        <UnderlineTabs
          ariaLabel="Change request filters"
          activeId={tab}
          onSelect={(id) => setTab(id as Tab)}
          items={[
            { id: 'open', label: 'Open', count: open.length },
            { id: 'closed', label: 'Closed', count: closed.length },
          ]}
        />
      </OperatePageHeader>
      <div className="operate-enter flex-1 overflow-auto px-6 py-4">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : items === null ? (
          <OperateLoadingBlock className="px-0 py-0" />
        ) : visible.length === 0 ? (
          tab === 'open' ? (
            <OperateEmptyState
              title="Changes is where agent proposals land"
              description="When an AI helper suggests a change, it shows up here for you to approve, comment on, or reject — nothing writes until you say so. Empty is normal until you connect a helper and ask it to update a page."
              action={
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link href="/settings/connect">Connect an AI helper</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/">Open a database</Link>
                  </Button>
                </div>
              }
            />
          ) : (
            <OperateEmptyState
              title="No closed change requests yet"
              description="Merged and rejected requests will appear here."
            />
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
                        className="font-medium text-foreground underline-offset-4 group-hover:underline"
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
                      <Link href={href} className="block text-foreground">
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
