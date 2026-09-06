'use client';

import { useCallback, useEffect, useState } from 'react';
import { SettingsNav } from '@/components/settings/settings-nav';
import { Button } from '@/components/ui/button';

export default function SettingsAccountPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    void fetch('/api/me')
      .then(async (response) => {
        const body = (await response.json()) as {
          workspaceId?: string;
          email?: string | null;
          error?: string;
        };
        if (!response.ok) {
          setError(body.error ?? 'Sign in required');
          return;
        }
        setWorkspaceId(body.workspaceId ?? null);
        setEmail(body.email ?? null);
      })
      .catch(() => setError('Could not load account'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-1 flex-col">
      <SettingsNav />
      <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
        <div className="space-y-2">
          <h2 className="text-lg font-medium">Account</h2>
          <p className="text-sm text-muted-foreground">
            Your signed-in identity and workspace. Connect AI helpers from the
            Connect AI tab.
          </p>
        </div>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <div className="space-y-4 rounded-lg border border-border p-4">
            <div>
              <p className="text-xs text-muted-foreground">Signed in as</p>
              <p className="mt-1 text-sm">{email ?? '…'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Workspace</p>
              <p className="mt-1 font-mono text-xs break-all">
                {workspaceId ?? '…'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <a href="/settings/connect">Connect an AI helper</a>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <a href="/logout">Sign out</a>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
