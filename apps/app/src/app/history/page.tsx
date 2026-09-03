'use client';

import { useState } from 'react';
import { ConsoleNav } from '../console-nav';

export default function HistoryPage() {
  const [collection, setCollection] = useState('opportunities');
  const [recordId, setRecordId] = useState('');
  const [result, setResult] = useState('');

  async function load(): Promise<void> {
    const response = await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection, recordId, limit: 50 }),
    });
    const body = await response.json();
    setResult(JSON.stringify(body, null, 2));
  }

  return (
    <main className="page">
      <ConsoleNav />
      <h1>History</h1>
      <label>
        Collection
        <input
          value={collection}
          onChange={(event) => setCollection(event.target.value)}
        />
      </label>
      <label>
        Record id
        <input
          value={recordId}
          onChange={(event) => setRecordId(event.target.value)}
        />
      </label>
      <p>
        <button type="button" onClick={() => void load()}>
          Load revisions
        </button>
      </p>
      {result ? <pre role="status">{result}</pre> : null}
    </main>
  );
}
