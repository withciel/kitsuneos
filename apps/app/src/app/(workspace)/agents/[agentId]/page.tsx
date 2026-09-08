'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AccessEditor } from '@/components/access/access-editor';
import { OperateLoadingBlock } from '@/components/operate/loading-block';
import { OperatePageHeader } from '@/components/operate/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useShellContext } from '@/hooks/use-shell-context';

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

  useShellContext(
    agent
      ? {
          title: agent.name,
          crumbs: [{ label: 'Agents', href: '/agents' }],
        }
      : null,
  );

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
    return <OperateLoadingBlock rows={4} />;
  }

  if (!agent) {
    return (
      <div className="flex flex-1 flex-col items-start gap-3 px-6 py-4">
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
      <OperatePageHeader
        title={agent.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{membershipLabel}</Badge>
            <span>
              {agent.activeKeyCount} active token
              {agent.activeKeyCount === 1 ? '' : 's'}
            </span>
          </span>
        }
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/agents">All agents</Link>
          </Button>
        }
      />
      <div className="operate-enter mx-auto w-full max-w-3xl space-y-6 px-6 py-6">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <section className="space-y-3 border-b border-border pb-6">
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
          <div className="space-y-1 border-b border-border pb-6">
            <h3 className="text-sm font-medium">Access</h3>
            <p className="text-sm text-muted-foreground">
              Only workspace owners and admins can view and manage this
              agent&apos;s access.
            </p>
          </div>
        )}

        <section className="space-y-3">
          <h3 className="text-sm font-medium">Activity</h3>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No change requests authored yet.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {activity.map((item) => {
                const databases = [
                  ...new Set(item.operations.map((op) => op.collection)),
                ];
                return (
                  <li key={item.id}>
                    <Link
                      href={`/changes/${item.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-muted/40"
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
