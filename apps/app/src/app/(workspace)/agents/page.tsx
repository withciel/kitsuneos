'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { OperateEmptyState } from '@/components/operate/empty-state';
import { OperateLoadingBlock } from '@/components/operate/loading-block';
import { OperatePageHeader } from '@/components/operate/page-header';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
      <OperatePageHeader
        title="Agents"
        description="Every AI helper connected to this workspace — identity, membership, and access, next to People."
        action={
          isAdmin ? (
            <CreateAgentDialog teams={teams} onCreated={() => void reload()} />
          ) : undefined
        }
      />
      <div className="operate-enter flex-1 overflow-auto px-6 py-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {loading ? (
          <OperateLoadingBlock className="px-0 py-0" />
        ) : agents.length === 0 ? (
          <OperateEmptyState
            title="No agents yet"
            description="Create an agent to give an AI helper its own identity, access grants, and API token."
            action={
              isAdmin ? (
                <CreateAgentDialog
                  teams={teams}
                  onCreated={() => void reload()}
                />
              ) : (
                <Button asChild size="sm" variant="outline">
                  <Link href="/settings/connect">Connect an AI helper</Link>
                </Button>
              )
            }
          />
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
  emptyLabel = 'No agents in this group yet.',
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
        <div className="overflow-hidden rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-36">Tokens</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((agent) => (
                <TableRow key={agent.id} className="group">
                  <TableCell>
                    <Link
                      href={`/agents/${agent.id}`}
                      className="font-medium text-foreground underline-offset-4 group-hover:underline"
                    >
                      {agent.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {agent.activeKeyCount} active
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
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
