'use client';

import { useCallback, useEffect, useState } from 'react';
import { ConsoleNav } from '../console-nav';

interface GrantsResponse {
  grants: Array<{
    id: string;
    principalId: string;
    collection: string;
    capability: string;
    fieldMask: string[] | null;
    revokedAt: string | null;
  }>;
  principals: Array<{ id: string; display_name: string; kind: string }>;
  collections: Array<{ id: string; name: string }>;
  error?: string;
}

export default function GrantsPage() {
  const [data, setData] = useState<GrantsResponse | null>(null);
  const [principalId, setPrincipalId] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [capability, setCapability] = useState('read');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/grants');
    const body = (await response.json()) as GrantsResponse;
    if (!response.ok) {
      setData({
        grants: [],
        principals: [],
        collections: [],
        error: body.error ?? 'Sign in to manage grants.',
      });
      return;
    }
    setData(body);
    setPrincipalId(body.principals[0]?.id ?? '');
    setCollectionId(body.collections[0]?.id ?? '');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createGrant(): Promise<void> {
    const response = await fetch('/api/grants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ principalId, collectionId, capability }),
    });
    const body = (await response.json()) as { error?: string };
    setMessage(body.error ?? 'Grant created.');
    await load();
  }

  async function revoke(grantId: string): Promise<void> {
    const response = await fetch('/api/grants', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grantId }),
    });
    const body = (await response.json()) as { error?: string };
    setMessage(body.error ?? 'Grant revoked.');
    await load();
  }

  return (
    <main className="page">
      <ConsoleNav />
      <h1>Grants</h1>
      {data?.error ? <p role="status">{data.error}</p> : null}
      <ul>
        {data?.grants
          .filter((grant) => !grant.revokedAt)
          .map((grant) => (
            <li key={grant.id}>
              {grant.collection} · {grant.capability} ·{' '}
              {grant.principalId.slice(0, 8)}
              {grant.fieldMask ? ` · mask ${grant.fieldMask.join(',')}` : ''}{' '}
              <button type="button" onClick={() => void revoke(grant.id)}>
                Revoke
              </button>
            </li>
          ))}
      </ul>
      <h2>Create grant</h2>
      <label>
        Principal
        <select
          value={principalId}
          onChange={(event) => setPrincipalId(event.target.value)}
        >
          {data?.principals.map((principal) => (
            <option key={principal.id} value={principal.id}>
              {principal.display_name} ({principal.kind})
            </option>
          ))}
        </select>
      </label>
      <label>
        Collection
        <select
          value={collectionId}
          onChange={(event) => setCollectionId(event.target.value)}
        >
          {data?.collections.map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Capability
        <select
          value={capability}
          onChange={(event) => setCapability(event.target.value)}
        >
          {['read', 'propose', 'write', 'admin'].map((cap) => (
            <option key={cap} value={cap}>
              {cap}
            </option>
          ))}
        </select>
      </label>
      <p>
        <button type="button" onClick={() => void createGrant()}>
          Create grant
        </button>
      </p>
      {message ? <p role="status">{message}</p> : null}
    </main>
  );
}
