'use client';

import { useEffect, useState } from 'react';
import { SettingsNav } from '@/components/settings/settings-nav';
import { Badge } from '@/components/ui/badge';

export default function SettingsWorkspacePage() {
  const [data, setData] = useState<{
    userId?: string;
    workspaceId?: string;
    apiKeyPlaintext?: string | null;
    error?: string;
  } | null>(null);

  useEffect(() => {
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
      })
      .catch(() => setData({ error: 'Failed to load workspace' }));
  }, []);

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
            {data?.apiKeyPlaintext ? (
              <div>
                <p className="text-xs text-muted-foreground">API key</p>
                <code className="mt-1 block rounded-md bg-muted p-2 font-mono text-xs">
                  {data.apiKeyPlaintext}
                </code>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
