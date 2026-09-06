'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

interface PlanUsageSnapshot {
  plan: 'free' | 'pro';
  limits: {
    workspacesPerUser: number;
    agentsPerWorkspace: number;
    membersPerWorkspace: number;
    collectionsPerWorkspace: number;
    storageBytesPerWorkspace: number;
    mcpOpsPerDay: number;
  };
  usage: {
    workspacesPerUser: number | null;
    agentsPerWorkspace: number;
    membersPerWorkspace: number;
    collectionsPerWorkspace: number;
    storageBytesPerWorkspace: number;
    mcpOpsPerDay: number;
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function UsageRow({
  label,
  used,
  limit,
  format = (n: number) => String(n),
}: {
  label: string;
  used: number | null;
  limit: number;
  format?: (n: number) => string;
}) {
  if (used == null) return null;
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">
        {format(used)} / {format(limit)}
      </span>
    </div>
  );
}

export function BillingPanel() {
  const [snapshot, setSnapshot] = useState<PlanUsageSnapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void fetch('/api/billing/status')
      .then(async (response) => {
        const body = (await response.json()) as PlanUsageSnapshot & {
          error?: string;
        };
        if (!response.ok) {
          setError(body.error ?? 'Could not load billing');
          return;
        }
        setSnapshot(body);
        setError('');
      })
      .catch(() => setError('Could not load billing'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function startCheckout() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/billing/checkout', { method: 'POST' });
      const body = (await response.json()) as {
        checkoutUrl?: string;
        error?: string;
      };
      if (!response.ok || !body.checkoutUrl) {
        setError(body.error ?? 'Checkout unavailable');
        return;
      }
      window.location.href = body.checkoutUrl;
    } catch {
      setError('Checkout failed');
    } finally {
      setBusy(false);
    }
  }

  function openPortal() {
    setBusy(true);
    setError('');
    // Portal route redirects to Dodo customer portal.
    window.location.href = '/api/billing/portal';
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-medium">Billing</h2>
        <p className="text-sm text-muted-foreground">
          Open to everyone. Free includes one workspace with published limits.
          Pro (via Dodo Payments) raises caps for seats, agents, and automation.
          Sign-in uses WorkOS AuthKit.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!snapshot ? (
        <p className="text-sm text-muted-foreground">Loading plan…</p>
      ) : (
        <>
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground">Current plan</p>
            <p className="mt-1 text-xl font-semibold capitalize">
              {snapshot.plan}
            </p>
            <div className="mt-4">
              <UsageRow
                label="Workspaces"
                used={snapshot.usage.workspacesPerUser}
                limit={snapshot.limits.workspacesPerUser}
              />
              <UsageRow
                label="People"
                used={snapshot.usage.membersPerWorkspace}
                limit={snapshot.limits.membersPerWorkspace}
              />
              <UsageRow
                label="Agents"
                used={snapshot.usage.agentsPerWorkspace}
                limit={snapshot.limits.agentsPerWorkspace}
              />
              <UsageRow
                label="Databases"
                used={snapshot.usage.collectionsPerWorkspace}
                limit={snapshot.limits.collectionsPerWorkspace}
              />
              <UsageRow
                label="Storage"
                used={snapshot.usage.storageBytesPerWorkspace}
                limit={snapshot.limits.storageBytesPerWorkspace}
                format={formatBytes}
              />
              <UsageRow
                label="Agent ops today"
                used={snapshot.usage.mcpOpsPerDay}
                limit={snapshot.limits.mcpOpsPerDay}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {snapshot.plan === 'free' ? (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void startCheckout()}
              >
                Upgrade to Pro
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={openPortal}
              >
                Manage subscription
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy} onClick={load}>
              Refresh usage
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
