'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AgentRow {
  id: string;
  name: string;
  createdAt: string;
  activeKeyCount: number;
}

export function AgentsPanel() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [plaintext, setPlaintext] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const response = await fetch('/api/agents');
    const body = (await response.json()) as {
      agents?: AgentRow[];
      error?: string;
    };
    if (!response.ok) {
      setError(body.error ?? 'Could not load agents');
      return;
    }
    setAgents(body.agents ?? []);
    setError('');
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function createAgent() {
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    setPlaintext(null);
    try {
      const response = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), mintKey: true }),
      });
      const body = (await response.json()) as {
        agent?: AgentRow;
        apiKeyPlaintext?: string | null;
        error?: string;
      };
      if (!response.ok) {
        setError(body.error ?? 'Could not create agent');
        return;
      }
      setPlaintext(body.apiKeyPlaintext ?? null);
      setName('');
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function rotateToken(agentId: string) {
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <h3 className="text-sm font-medium">Agent profiles</h3>
        <p className="text-sm text-muted-foreground">
          Named agents with their own API tokens. Each agent is a first-class
          principal with grant-scoped access and Supermemory-style{' '}
          <code className="text-xs">memory_*</code> tools over pages it can see.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="agent-name">Name</Label>
          <Input
            id="agent-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Research assistant"
            className="w-56"
          />
        </div>
        <Button
          size="sm"
          disabled={busy || !name.trim()}
          onClick={() => void createAgent()}
        >
          Create agent
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
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <ul className="space-y-2">
        {agents.length === 0 ? (
          <li className="text-sm text-muted-foreground">
            No agent profiles yet.
          </li>
        ) : (
          agents.map((agent) => (
            <li
              key={agent.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">{agent.name}</p>
                <p className="text-xs text-muted-foreground">
                  {agent.activeKeyCount} active token
                  {agent.activeKeyCount === 1 ? '' : 's'} ·{' '}
                  {agent.id.slice(0, 8)}…
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void rotateToken(agent.id)}
              >
                Rotate token
              </Button>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
