'use client';

import { Bot } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

interface AgentRow {
  id: string;
  name: string;
  createdAt: string;
  activeKeyCount: number;
  membership: 'workspace' | 'team' | 'personal';
  teamId: string | null;
  ownerPrincipalId: string | null;
}

interface TeamOption {
  principalId: string;
  label: string;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [myPrincipalId, setMyPrincipalId] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setError('');
    const [agentsRes, targetsRes, meRes] = await Promise.all([
      fetch('/api/agents'),
      fetch('/api/share-targets'),
      fetch('/api/me'),
    ]);
    const agentsBody = (await agentsRes.json()) as {
      agents?: AgentRow[];
      error?: string;
    };
    if (!agentsRes.ok) {
      setError(agentsBody.error ?? 'Could not load agents');
      return;
    }
    setAgents(agentsBody.agents ?? []);

    const targetsBody = (await targetsRes.json()) as {
      targets?: Array<{ principalId: string; label: string; kind: string }>;
    };
    setTeams(
      (targetsBody.targets ?? [])
        .filter((t) => t.kind === 'team')
        .map((t) => ({ principalId: t.principalId, label: t.label })),
    );

    const meBody = (await meRes.json()) as {
      principalId?: string;
      role?: string;
    };
    setMyPrincipalId(meBody.principalId ?? '');
    setIsAdmin(meBody.role === 'owner' || meBody.role === 'admin');
  }, []);

  useEffect(() => {
    void reload()
      .catch(() => setError('Could not load agents'))
      .finally(() => setLoading(false));
  }, [reload]);

  const teamLabel = useCallback(
    (teamId: string | null) =>
      teams.find((t) => t.principalId === teamId)?.label ?? 'Team',
    [teams],
  );

  const workspaceAgents = useMemo(
    () => agents.filter((a) => a.membership === 'workspace'),
    [agents],
  );
  const teamAgents = useMemo(() => {
    const groups = new Map<string, AgentRow[]>();
    for (const agent of agents) {
      if (agent.membership !== 'team' || !agent.teamId) continue;
      const list = groups.get(agent.teamId) ?? [];
      list.push(agent);
      groups.set(agent.teamId, list);
    }
    return groups;
  }, [agents]);
  const personalAgents = useMemo(
    () => agents.filter((a) => a.membership === 'personal'),
    [agents],
  );

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Agents</h1>
            <p className="text-xs text-muted-foreground">
              Every AI helper connected to this workspace — identity,
              membership, and access, next to People.
            </p>
          </div>
          {isAdmin ? (
            <CreateAgentDialog teams={teams} onCreated={() => void reload()} />
          ) : null}
        </div>
      </div>
      <div className="flex-1 overflow-auto px-6 py-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : agents.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-start gap-4 py-6">
            <div className="space-y-2">
              <p className="text-sm font-medium tracking-tight">
                No agents yet
              </p>
              <p className="text-sm text-muted-foreground">
                Create an agent to give an AI helper its own identity, access
                grants, and API token.
              </p>
            </div>
            {isAdmin ? (
              <CreateAgentDialog
                teams={teams}
                onCreated={() => void reload()}
              />
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link href="/settings/connect">Connect an AI helper</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            <AgentSection title="Workspace agents" agents={workspaceAgents} />
            {[...teamAgents.entries()].map(([teamId, list]) => (
              <AgentSection
                key={teamId}
                title={`${teamLabel(teamId)} agents`}
                agents={list}
              />
            ))}
            <AgentSection
              title="Personal agents"
              agents={personalAgents}
              emptyLabel={
                myPrincipalId
                  ? 'No personal agents yet.'
                  : 'No personal agents visible to you.'
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

function AgentSection({
  title,
  agents,
  emptyLabel = 'None yet.',
}: {
  title: string;
  agents: AgentRow[];
  emptyLabel?: string;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      {agents.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <li key={agent.id}>
              <Link
                href={`/agents/${agent.id}`}
                className="flex items-center gap-3 rounded-lg border border-border p-3 hover:border-primary/50 hover:bg-muted/50"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Bot className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{agent.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {agent.activeKeyCount} active token
                    {agent.activeKeyCount === 1 ? '' : 's'}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CreateAgentDialog({
  teams,
  onCreated,
}: {
  teams: TeamOption[];
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [membership, setMembership] = useState<
    'workspace' | 'team' | 'personal'
  >('workspace');
  const [teamId, setTeamId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [plaintext, setPlaintext] = useState<string | null>(null);

  async function createAgent() {
    if (!name.trim()) {
      setError('Enter a name.');
      return;
    }
    if (membership === 'team' && !teamId) {
      setError('Pick a team.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          mintKey: true,
          membership,
          teamId: membership === 'team' ? teamId : undefined,
        }),
      });
      const body = (await response.json()) as {
        apiKeyPlaintext?: string | null;
        error?: string;
      };
      if (!response.ok) {
        setError(body.error ?? 'Could not create agent');
        return;
      }
      setPlaintext(body.apiKeyPlaintext ?? null);
      setName('');
      onCreated();
    } catch {
      setError('Could not create agent');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setPlaintext(null);
          setError('');
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">New agent</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create an agent</DialogTitle>
          <DialogDescription>
            Give an AI helper its own identity, membership, and API token.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="new-agent-name">Name</Label>
            <Input
              id="new-agent-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Research assistant"
              disabled={busy}
            />
          </div>
          <div className="space-y-1">
            <Label>Membership</Label>
            <Select
              value={membership}
              onValueChange={(value) =>
                setMembership(value as 'workspace' | 'team' | 'personal')
              }
              disabled={busy}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="workspace">
                  Workspace — visible to everyone
                </SelectItem>
                <SelectItem value="team">Team — scoped to one team</SelectItem>
                <SelectItem value="personal">
                  Personal — only you manage it
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {membership === 'team' ? (
            <div className="space-y-1">
              <Label>Team</Label>
              <Select value={teamId} onValueChange={setTeamId} disabled={busy}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a team…" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((team) => (
                    <SelectItem key={team.principalId} value={team.principalId}>
                      {team.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {teams.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No teams yet — create one in{' '}
                  <Link href="/settings/teams" className="underline">
                    Settings → Teams
                  </Link>
                  .
                </p>
              ) : null}
            </div>
          ) : null}
          {plaintext ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p className="font-medium">
                Copy this token now — it won&apos;t be shown again.
              </p>
              <code className="mt-1 block break-all font-mono text-xs">
                {plaintext}
              </code>
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          {plaintext ? (
            <Button size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={busy || !name.trim()}
              onClick={() => void createAgent()}
            >
              {busy ? 'Creating…' : 'Create agent'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
