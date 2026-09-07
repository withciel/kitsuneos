'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { PageOpGroup } from '@/lib/group-ops-by-page';

export interface DiffOperation {
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

function renderValue(value: unknown): string {
  if (value === undefined) return '(empty)';
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value === '' ? '(empty)' : value;
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

function opLabel(op: string): string {
  switch (op) {
    case 'insert':
      return 'Create page';
    case 'update':
      return 'Update field';
    case 'delete':
      return 'Delete page';
    default:
      return op;
  }
}

function shortId(id: string | null | undefined): string {
  if (!id) return 'new page';
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function opStatusBadge(status: string): {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
} {
  switch (status) {
    case 'approved':
      return { label: 'Approved', variant: 'default' };
    case 'rejected':
      return { label: 'Rejected', variant: 'destructive' };
    case 'conflicted':
      return { label: 'Conflicted', variant: 'destructive' };
    default:
      return { label: 'Pending', variant: 'secondary' };
  }
}

/**
 * Unified property diff for a change request, GitHub-PR "Files changed"
 * style: grouped by page, one entry per op with before/after and an
 * inline approve/reject decision.
 */
export function ChangeDiff({
  groups,
  decisions,
  onDecide,
  readOnly = false,
}: {
  groups: PageOpGroup<DiffOperation>[];
  decisions: Record<string, 'approved' | 'rejected'>;
  onDecide: (opId: string, status: 'approved' | 'rejected') => void;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section
          key={`diff-${group.key}`}
          id={`page-${group.key}`}
          className="space-y-3"
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
            <Badge variant="secondary">{group.collection}</Badge>
            {group.href ? (
              <Link
                href={group.href}
                className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
              >
                Page {shortId(group.recordId)}
              </Link>
            ) : (
              <span className="text-sm font-semibold">New page</span>
            )}
            <span className="text-xs text-muted-foreground">
              {group.ops.length} {group.ops.length === 1 ? 'change' : 'changes'}
            </span>
          </div>
          <ul className="space-y-3">
            {group.ops.map((op) => {
              const decided = decisions[op.id];
              const badge = opStatusBadge(decided ?? op.status);
              return (
                <li
                  key={op.id}
                  className="rounded-md border border-border bg-card p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{opLabel(op.op)}</Badge>
                    {op.fieldName ? (
                      <span className="text-xs text-muted-foreground">
                        Field:{' '}
                        <span className="text-foreground">{op.fieldName}</span>
                      </span>
                    ) : null}
                    <Badge variant={badge.variant} className="ml-auto">
                      {badge.label}
                    </Badge>
                  </div>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">
                        Before
                      </p>
                      <div className="overflow-auto rounded bg-destructive/5 p-2 whitespace-pre-wrap">
                        {renderValue(op.before)}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">
                        After
                      </p>
                      <div className="overflow-auto rounded bg-primary/5 p-2 whitespace-pre-wrap">
                        {renderValue(op.newValue)}
                      </div>
                    </div>
                  </div>
                  {!readOnly ? (
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant={decided === 'approved' ? 'default' : 'outline'}
                        onClick={() => onDecide(op.id, 'approved')}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant={
                          decided === 'rejected' ? 'destructive' : 'outline'
                        }
                        onClick={() => onDecide(op.id, 'rejected')}
                      >
                        Reject
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
