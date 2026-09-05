'use client';

import { useCallback, useEffect, useState } from 'react';
import { SettingsNav } from '@/components/settings/settings-nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function SettingsWorkspacePage() {
  const [data, setData] = useState<{
    userId?: string;
    workspaceId?: string;
    apiKeyPlaintext?: string | null;
    error?: string;
  } | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = useCallback(() => {
    void fetch('/api/me')
      .then(async (response) => {
        const body = (await response.json()) as {
          userId?: string;
          workspaceId?: string;
          apiKeyPlaintext?: string | null;
          error?: string;
        };
        if (!response.ok) {
          setData({ error: body.error ?? 'Sign in required' });
          return;
        }
        setData(body);
        if (body.apiKeyPlaintext) {
          setRevealedKey(body.apiKeyPlaintext);
        }
      })
      .catch(() => setData({ error: 'Failed to load workspace' }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function rotateApiKey() {
    setBusy(true);
    setActionError('');
    try {
      const response = await fetch('/api/me/api-key', { method: 'POST' });
      const body = (await response.json()) as {
        apiKeyPlaintext?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? 'Could not create API key');
      }
      if (!body.apiKeyPlaintext) {
        throw new Error('API key missing from response');
      }
      setRevealedKey(body.apiKeyPlaintext);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <SettingsNav />
      <div className="space-y-4 p-6">
        {data?.error ? (
          <p className="text-sm text-destructive">{data.error}</p>
        ) : (
          <>
            <div>
              <p className="text-xs text-muted-foreground">Workspace ID</p>
              <Badge variant="secondary" className="mt-1 font-mono">
                {data?.workspaceId ?? '…'}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">User ID</p>
              <Badge variant="outline" className="mt-1 font-mono">
                {data?.userId ?? '…'}
              </Badge>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">API key</p>
              <p className="text-sm text-muted-foreground">
                Use this key as a Bearer token for MCP / HTTP. It is shown once
                after signup or when you generate a new key.
              </p>
              {revealedKey ? (
                <code className="block rounded-md bg-muted p-2 font-mono text-xs break-all">
                  {revealedKey}
                </code>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No key on screen. Generate one to connect an agent.
                </p>
              )}
              {actionError ? (
                <p className="text-sm text-destructive">{actionError}</p>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void rotateApiKey()}
              >
                {busy
                  ? 'Generating…'
                  : revealedKey
                    ? 'Generate new API key'
                    : 'Generate API key'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
