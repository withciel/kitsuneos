'use client';

import { useState } from 'react';
import { ConsoleNav } from '../console-nav';

export default function AuditPage() {
  const [action, setAction] = useState('');
  const [outcome, setOutcome] = useState('');
  const [result, setResult] = useState('');

  async function search(): Promise<void> {
    const response = await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: action || undefined,
        outcome: outcome || undefined,
        limit: 50,
      }),
    });
    const body = await response.json();
    setResult(JSON.stringify(body, null, 2));
  }

  return (
    <main className="page">
      <ConsoleNav />
      <h1>Audit</h1>
      <p>Admin-only. Denied attempts are included.</p>
      <label>
        Action
        <input
          value={action}
          onChange={(event) => setAction(event.target.value)}
          placeholder="query"
        />
      </label>
      <label>
        Outcome
        <select
          value={outcome}
          onChange={(event) => setOutcome(event.target.value)}
        >
          <option value="">any</option>
          <option value="allowed">allowed</option>
          <option value="denied">denied</option>
        </select>
      </label>
      <p>
        <button type="button" onClick={() => void search()}>
          Search
        </button>
      </p>
      {result ? <pre role="status">{result}</pre> : null}
    </main>
  );
}
