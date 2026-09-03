'use client';

import {
  ActionConsent,
  type ConsentAction,
  type ConsentDecision,
} from '@kitsuneos/ui';
import { useCallback, useEffect, useState } from 'react';
import { ConsoleNav } from '../console-nav';

interface ChangeSetResponse {
  changeSets: Array<{
    id: string;
    title: string | null;
    rationale: string | null;
    status: string;
    author: string;
    operations: Array<{
      id: string;
      collection: string;
      fieldName: string | null;
      op: string;
      newValue: unknown;
      before: unknown;
      status: string;
    }>;
  }>;
}

export default function ReviewPage() {
  const [changeSets, setChangeSets] = useState<ChangeSetResponse['changeSets']>(
    [],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/review');
      if (!response.ok) {
        setMessage('Sign in to view the review queue.');
        setChangeSets([]);
        return;
      }
      const data = (await response.json()) as ChangeSetResponse;
      setChangeSets(data.changeSets);
      setActiveIndex(0);
    } catch {
      setMessage('Could not load the review queue.');
      setChangeSets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const active = changeSets[activeIndex];

  async function handleSubmit(input: {
    decisions: ConsentDecision[];
    apply: boolean;
  }): Promise<void> {
    if (!active) return;
    try {
      const response = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changeSetId: active.id,
          decisions: input.decisions,
          apply: input.apply,
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        status?: string;
      };
      if (!response.ok) {
        setMessage(body.error ?? 'Request failed');
        return;
      }
      setMessage(
        input.apply
          ? `Applied: ${body.status ?? 'done'}`
          : 'Review saved. Apply only after every operation is decided.',
      );
      await loadQueue();
    } catch {
      setMessage('Request failed');
    }
  }

  if (loading) {
    return (
      <main className="page">
        <ConsoleNav />
        <p role="status">Loading review queue…</p>
      </main>
    );
  }

  if (!active) {
    return (
      <main className="page">
        <ConsoleNav />
        <h1>Review queue</h1>
        <p>No open change sets. Ask your agent to propose one via MCP.</p>
        {message ? <p role="status">{message}</p> : null}
      </main>
    );
  }

  const systems = [...new Set(active.operations.map((o) => o.collection))];
  const actions: ConsentAction[] = active.operations.map((op) => ({
    id: op.id,
    collection: op.collection,
    field: op.fieldName ?? undefined,
    op: op.op,
    before: op.before,
    after: op.newValue,
    status: op.status,
  }));

  return (
    <main className="page">
      <ConsoleNav />
      <h1>Review queue</h1>
      <p>
        Change set from {active.author}
        {active.title ? `: ${active.title}` : ''}
      </p>
      {changeSets.length > 1 ? (
        <nav aria-label="Change sets">
          {changeSets.map((cs, index) => (
            <button
              key={cs.id}
              type="button"
              className={index === activeIndex ? 'active' : undefined}
              onClick={() => setActiveIndex(index)}
            >
              {cs.title ?? cs.id.slice(0, 8)}
            </button>
          ))}
        </nav>
      ) : null}
      <ActionConsent
        key={`${active.id}:${active.operations.map((op) => `${op.id}:${op.status}`).join(',')}`}
        systems={systems}
        actions={actions}
        intent={active.rationale ?? undefined}
        reversible
        scope="write"
        onSubmit={(input) => void handleSubmit(input)}
        onDecline={() =>
          void handleSubmit({
            decisions: active.operations.map((op) => ({
              opId: op.id,
              status: 'rejected',
            })),
            apply: false,
          })
        }
      />
      {message ? <p role="status">{message}</p> : null}
    </main>
  );
}
