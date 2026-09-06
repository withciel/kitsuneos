'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface OAuthAppRow {
  id: string;
  name: string;
  clientId: string;
  scopes: string[];
  principalId: string;
  createdAt: string;
}

export function OAuthAppsPanel() {
  const [apps, setApps] = useState<OAuthAppRow[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const response = await fetch('/api/oauth/apps');
    const body = (await response.json()) as {
      apps?: OAuthAppRow[];
      error?: string;
    };
    if (!response.ok) {
      setError(body.error ?? 'Could not load OAuth apps');
      return;
    }
    setApps(body.apps ?? []);
    setError('');
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function createApp() {
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    setClientSecret(null);
    setCreatedClientId(null);
    try {
      const response = await fetch('/api/oauth/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const body = (await response.json()) as {
        app?: OAuthAppRow;
        clientSecret?: string;
        error?: string;
      };
      if (!response.ok) {
        setError(body.error ?? 'Could not create OAuth app');
        return;
      }
      setClientSecret(body.clientSecret ?? null);
      setCreatedClientId(body.app?.clientId ?? null);
      setName('');
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function revokeApp(appId: string) {
    if (!window.confirm('Revoke this OAuth app and its tokens?')) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/oauth/apps?appId=${encodeURIComponent(appId)}`,
        { method: 'DELETE' },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? 'Could not revoke app');
        return;
      }
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <h3 className="text-sm font-medium">
          OAuth apps (Kitsune as database)
        </h3>
        <p className="text-sm text-muted-foreground">
          Third-party apps register here, then use{' '}
          <code className="text-xs">POST /api/oauth/token</code> (client
          credentials) and create databases via{' '}
          <code className="text-xs">POST /api/collections</code> with the bearer
          token.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="oauth-app-name">App name</Label>
          <Input
            id="oauth-app-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Acme CRM"
            className="w-56"
          />
        </div>
        <Button
          size="sm"
          disabled={busy || !name.trim()}
          onClick={() => void createApp()}
        >
          Create OAuth app
        </Button>
      </div>
      {clientSecret && createdClientId ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium">Save these credentials now.</p>
          <p className="mt-1 font-mono text-xs">client_id: {createdClientId}</p>
          <p className="font-mono text-xs">client_secret: {clientSecret}</p>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <ul className="space-y-2">
        {apps.length === 0 ? (
          <li className="text-sm text-muted-foreground">No OAuth apps yet.</li>
        ) : (
          apps.map((app) => (
            <li
              key={app.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">{app.name}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {app.clientId}
                </p>
                <p className="text-xs text-muted-foreground">
                  scopes: {app.scopes.join(', ')}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void revokeApp(app.id)}
              >
                Revoke
              </Button>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
