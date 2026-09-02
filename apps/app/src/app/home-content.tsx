'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function HomeContent() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetch('/api/me')
      .then(async (response) => {
        if (!response.ok) {
          setError('Sign in to manage your workspace.');
          return;
        }
        const data = (await response.json()) as {
          apiKeyPlaintext?: string | null;
        };
        if (data.apiKeyPlaintext) {
          setApiKey(data.apiKeyPlaintext);
        }
      })
      .catch(() => setError('Could not load workspace.'));
  }, []);

  return (
    <main className="page">
      <h1>KitsuneOS Console</h1>
      <p>Agents propose. You approve.</p>
      {apiKey ? (
        <section aria-labelledby="api-key-heading">
          <h2 id="api-key-heading">Your API key</h2>
          <p>Copy this key now. It will not be shown again.</p>
          <code>{apiKey}</code>
        </section>
      ) : null}
      {error ? <p role="status">{error}</p> : null}
      <nav>
        <Link href="/review">Open review queue</Link>
        {' · '}
        <Link href="/api/billing/portal">Billing portal</Link>
      </nav>
    </main>
  );
}
