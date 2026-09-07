'use client';

import { Badge } from '@/components/ui/badge';

export interface ChecksSummary {
  status: string;
  pending: number;
  approved: number;
  rejected: number;
  conflicted: number;
  total: number;
  conflictedFields: string[];
  expiresAt: string;
}

export function statusTone(status: string): {
  label: string;
  detail: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
} {
  switch (status) {
    case 'applied':
      return {
        label: 'Merged',
        detail: 'Approved operations were applied.',
        variant: 'default',
      };
    case 'rejected':
      return {
        label: 'Closed',
        detail: 'This change request was rejected.',
        variant: 'destructive',
      };
    case 'blocked':
      return {
        label: 'Blocked',
        detail: 'Fields changed elsewhere since this was opened.',
        variant: 'destructive',
      };
    case 'stale':
      return {
        label: 'Stale',
        detail: 'Schema changed since this was opened — review before merging.',
        variant: 'destructive',
      };
    case 'expired':
      return {
        label: 'Expired',
        detail: 'This change request expired before it was decided.',
        variant: 'secondary',
      };
    default:
      return {
        label: 'Open',
        detail: 'Awaiting review.',
        variant: 'secondary',
      };
  }
}

/**
 * PR-style checks strip: mergeability + pending/approved/rejected counts +
 * staleness/conflict signals, computed from the change set's existing
 * status and per-op decisions.
 */
export function ChecksStrip({ checks }: { checks: ChecksSummary }) {
  const tone = statusTone(checks.status);
  const mergeable =
    checks.status === 'open' && checks.pending === 0 && checks.approved > 0;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/30 px-6 py-3 text-sm">
      <Badge variant={tone.variant}>{tone.label}</Badge>
      <span className="text-muted-foreground">{tone.detail}</span>
      <span className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>{checks.approved} approved</span>
        <span>{checks.rejected} rejected</span>
        <span>{checks.pending} pending</span>
        {checks.conflicted > 0 ? (
          <span className="text-destructive">
            {checks.conflicted} conflicted
          </span>
        ) : null}
        {checks.status === 'open' ? (
          <Badge variant={mergeable ? 'default' : 'outline'}>
            {mergeable ? 'Ready to merge' : 'Not mergeable yet'}
          </Badge>
        ) : null}
      </span>
    </div>
  );
}
