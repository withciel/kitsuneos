'use client';

import { useEffect, useState } from 'react';
import { ConsoleNav } from '../console-nav';

interface SchemaResponse {
  collections?: Array<{
    name: string;
    capability: string;
    fields: Array<{ name: string; type: string; writable: boolean }>;
  }>;
  error?: string;
}

export default function SchemaPage() {
  const [data, setData] = useState<SchemaResponse | null>(null);

  useEffect(() => {
    void fetch('/api/schema')
      .then(async (response) => {
        const body = (await response.json()) as SchemaResponse;
        if (!response.ok) {
          setData({ error: body.error ?? 'Sign in to view schema.' });
          return;
        }
        setData(body);
      })
      .catch(() => setData({ error: 'Could not load schema.' }));
  }, []);

  return (
    <main className="page">
      <ConsoleNav />
      <h1>Schema</h1>
      {data?.error ? <p role="status">{data.error}</p> : null}
      {data?.collections?.map((collection) => (
        <section key={collection.name}>
          <h2>
            {collection.name} <small>({collection.capability})</small>
          </h2>
          <ul>
            {collection.fields.map((field) => (
              <li key={field.name}>
                {field.name}: {field.type}
                {field.writable ? ' (writable)' : ''}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
