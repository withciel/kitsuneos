'use client';

import { KeyRound, LogOut, UserRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { SettingsNav } from '@/components/settings/settings-nav';
import {
  SettingsPageHeader,
  SettingsSection,
} from '@/components/settings/settings-section';
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
        <SettingsPageHeader
          icon={UserRound}
          title="Account"
          description="Your signed-in identity and current workspace. Manage AI agents from the Connect AI tab."
        />
        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : (
          <SettingsSection icon={KeyRound} title="Identity">
            <dl className="divide-y divide-border">
              <div className="flex items-center justify-between gap-4 py-2 text-sm first:pt-0">
                <dt className="text-muted-foreground">Signed in as</dt>
                <dd className="font-medium">{email ?? '…'}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-2 text-sm last:pb-0">
                <dt className="text-muted-foreground">Workspace ID</dt>
                <dd className="font-mono text-xs break-all">
                  {workspaceId ?? '…'}
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button asChild size="sm" variant="outline">
                <a href="/settings/connect">Connect an AI helper</a>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <a href="/logout">
                  <LogOut />
                  Sign out
                </a>
              </Button>
            </div>
          </SettingsSection>
        )}
      </div>
    </div>
  );
}
