'use client';

import { useState } from 'react';
import { ConsoleNav } from '../console-nav';

export default function QueryPage() {
  const [json, setJson] = useState(
    '{\n  "collection": "opportunities",\n  "fields": ["name", "stage"],\n  "limit": 20\n}',
  );
  const [result, setResult] = useState('');

  async function run(): Promise<void> {
    setResult('');
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>;
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const body = await response.json();
      setResult(JSON.stringify(body, null, 2));
    } catch (error) {
      setResult(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <main className="page">
      <ConsoleNav />
      <h1>Query</h1>
      <p>
        JSON is sent to the engine query compiler. Workspace comes from your
        session.
      </p>
      <label htmlFor="query-json">Query JSON</label>
      <textarea
        id="query-json"
        rows={12}
        style={{ width: '100%', fontFamily: 'monospace' }}
        value={json}
        onChange={(event) => setJson(event.target.value)}
      />
      <p>
        <button type="button" onClick={() => void run()}>
          Run query
        </button>
      </p>
      {result ? <pre role="status">{result}</pre> : null}
    </main>
  );
}
