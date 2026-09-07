'use client';

import { Bot } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AccessEditor } from '@/components/access/access-editor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface AgentDetail {
  id: string;
  name: string;
  createdAt: string;
  activeKeyCount: number;
  membership: 'workspace' | 'team' | 'personal';
  teamId: string | null;
  ownerPrincipalId: string | null;
}

interface ActivityItem {
  id: string;
  title: string | null;
  status: string;
  createdAt: string;
  operations: Array<{ collection: string }>;
}

export default function AgentProfilePage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;

  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [canManageAccess, setCanManageAccess] = useState(false);
  const [teamLabel, setTeamLabel] = useState('');
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [plaintext, setPlaintext] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError('');
    const [detailRes, activityRes, targetsRes] = await Promise.all([
      fetch(`/api/agents/${agentId}`),
      fetch(`/api/review?scope=all&authorId=${agentId}`),
      fetch('/api/share-targets'),
    ]);
    const detailBody = (await detailRes.json()) as {
      agent?: AgentDetail;
      canManageAccess?: boolean;
      error?: string;
    };
    if (!detailRes.ok) {
      setError(detailBody.error ?? 'Could not load agent');
      return;
    }
    setAgent(detailBody.agent ?? null);
    setCanManageAccess(Boolean(detailBody.canManageAccess));

    if (detailBody.agent?.teamId) {
      const targetsBody = (await targetsRes.json()) as {
        targets?: Array<{ principalId: string; label: string }>;
      };
      setTeamLabel(
        targetsBody.targets?.find(
          (t) => t.principalId === detailBody.agent?.teamId,
        )?.label ?? 'Team',
      );
    }

    const activityBody = (await activityRes.json()) as {
      changeSets?: ActivityItem[];
      error?: string;
    };
    setActivity(activityBody.changeSets ?? []);
  }, [agentId]);

  useEffect(() => {
    void reload()
      .catch(() => setError('Could not load agent'))
      .finally(() => setLoading(false));
  }, [reload]);

  async function rotateToken() {
    if (
      !window.confirm(
        'Rotate this agent token? The previous token stops working immediately.',
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    setPlaintext(null);
    try {
      const response = await fetch(`/api/agents/${agentId}/tokens`, {
        method: 'POST',
      });
      const body = (await response.json()) as {
        apiKeyPlaintext?: string;
        error?: string;
      };
      if (!response.ok) {
        setError(body.error ?? 'Could not rotate token');
        return;
      }
      setPlaintext(body.apiKeyPlaintext ?? null);
      await reload();
    } catch {
      setError('Could not rotate token');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex flex-1 flex-col items-start gap-3 p-6">
        <p className="text-sm text-destructive">
          {error || 'Agent not found.'}
        </p>
        <Button asChild size="sm" variant="outline">
          <Link href="/agents">Back to Agents</Link>
        </Button>
      </div>
    );
  }

  const membershipLabel =
    agent.membership === 'team'
      ? `Team${teamLabel ? ` · ${teamLabel}` : ''}`
      : agent.membership === 'personal'
        ? 'Personal'
        : 'Workspace';

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border px-6 py-4">
        <Button asChild size="sm" variant="ghost" className="mb-2 -ml-2">
          <Link href="/agents">← Agents</Link>
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Bot className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {agent.name}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="secondary">{membershipLabel}</Badge>
              <span className="text-xs text-muted-foreground">
                {agent.activeKeyCount} active token
                {agent.activeKeyCount === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <section className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">API token</h3>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void rotateToken()}
            >
              {busy ? 'Working…' : 'Rotate token'}
            </Button>
          </div>
          {plaintext ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p className="font-medium">
                Copy this token now — it won&apos;t be shown again.
              </p>
              <code className="mt-1 block break-all font-mono text-xs">
                {plaintext}
              </code>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Rotate to mint a new token and revoke the previous one.
            </p>
          )}
        </section>

        {canManageAccess ? (
          <AccessEditor principalId={agent.id} principalLabel={agent.name} />
        ) : (
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-medium">Access</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Only workspace owners and admins can view and manage this
              agent&apos;s access.
            </p>
          </div>
        )}

        <section className="space-y-3 rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium">Activity</h3>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No change requests authored yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {activity.map((item) => {
                const databases = [
                  ...new Set(item.operations.map((op) => op.collection)),
                ];
                return (
                  <li key={item.id}>
                    <Link
                      href={`/changes/${item.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/50"
                    >
                      <span className="font-medium">
                        {item.title ?? 'Untitled change request'}
                      </span>
                      <span className="flex items-center gap-2">
                        {databases.map((name) => (
                          <Badge key={name} variant="secondary">
                            {name}
                          </Badge>
                        ))}
                        <Badge
                          variant={
                            item.status === 'open' ? 'default' : 'outline'
                          }
                        >
                          {item.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
