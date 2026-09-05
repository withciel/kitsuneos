'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ChangeSetSummary {
  id: string;
  title: string | null;
  rationale: string | null;
  status: string;
  createdAt: string;
  author: string;
  operations: Array<{ collection: string }>;
}

export default function InboxPage() {
  const [items, setItems] = useState<ChangeSetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetch('/api/review')
      .then(async (response) => {
        const body = (await response.json()) as {
          changeSets?: ChangeSetSummary[];
          error?: string;
        };
        if (!response.ok) {
          setError(body.error ?? 'Failed to load inbox');
          return;
        }
        setItems(body.changeSets ?? []);
      })
      .catch(() => setError('Failed to load inbox'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
        <p className="text-xs text-muted-foreground">
          Open change requests awaiting review
        </p>
      </div>
      <div className="flex-1 overflow-auto px-6 py-4">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No open change sets. Writes from propose-capability users and agents
            land here for review.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Collections</TableHead>
                <TableHead>Opened</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const collections = [
                  ...new Set(item.operations.map((op) => op.collection)),
                ];
                return (
                  <TableRow key={item.id} className="cursor-pointer">
                    <TableCell>
                      <Link
                        href={`/inbox/${item.id}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {item.title ?? 'Untitled change set'}
                      </Link>
                      {item.rationale ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.rationale}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">{item.author}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {collections.map((name) => (
                          <Badge key={name} variant="secondary">
                            {name}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString()}
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
