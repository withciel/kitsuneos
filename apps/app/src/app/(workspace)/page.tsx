'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CreateDatabaseDialog } from '@/components/collection/create-database-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

type BootState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'empty'; memberOnly: boolean }
  | { kind: 'redirecting' };

export default function WorkspaceHomePage() {
  const router = useRouter();
  const [boot, setBoot] = useState<BootState>({ kind: 'loading' });
  const [notesBusy, setNotesBusy] = useState(false);

  useEffect(() => {
    void fetch('/api/schema')
      .then(async (response) => {
        if (response.status === 401) {
          window.location.assign('/login');
          return;
        }
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          setBoot({
            kind: 'error',
            message:
              body.error ??
              'Could not load your workspace. Refresh or sign in again.',
          });
          return;
        }
        const body = (await response.json()) as {
          collections?: Array<{ name: string }>;
        };
        if ((body.collections?.length ?? 0) > 0) {
          setBoot({ kind: 'redirecting' });
          router.replace(`/c/${body.collections![0]!.name}`);
          return;
        }
        try {
          const meRes = await fetch('/api/me');
          const meBody = (await meRes.json()) as { role?: string };
          setBoot({
            kind: 'empty',
            memberOnly:
              meBody.role === 'member' || meBody.role === 'viewer',
          });
        } catch {
          setBoot({ kind: 'empty', memberOnly: false });
        }
      })
      .catch(() =>
        setBoot({
          kind: 'error',
          message:
            'Could not reach the workspace API. Check your connection and retry.',
        }),
      );
  }, [router]);

  async function createPersonalNotes() {
    setNotesBusy(true);
    try {
      const response = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'notes',
          scope: 'personal',
          fields: [
            { name: 'title', type: 'text', nullable: false },
            { name: 'body', type: 'prose' },
            { name: 'tags', type: 'text' },
          ],
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Create failed');
      router.push('/c/notes');
    } catch {
      setNotesBusy(false);
    }
  }

  if (boot.kind === 'error') {
    return (
      <div className="flex flex-1 flex-col items-start gap-4 p-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Workspace unavailable
        </h1>
        <p className="max-w-md text-sm text-destructive">{boot.message}</p>
        <Button
          variant="outline"
          onClick={() => {
            setBoot({ kind: 'loading' });
            window.location.reload();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (boot.kind === 'empty') {
    return (
      <div className="flex flex-1 flex-col items-start gap-8 p-8">
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Welcome
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {boot.memberOnly
              ? 'No databases shared with you yet'
              : 'Start with an empty workspace'}
          </h1>
          <p className="max-w-lg text-sm text-muted-foreground">
            {boot.memberOnly
              ? 'Ask a workspace owner or admin to grant you access, or wait for a shared database.'
              : 'Nothing is seeded for you. Create a workspace database, a personal notes database, or connect an agent when you are ready.'}
          </p>
        </div>
        {boot.memberOnly ? null : (
          <div className="flex flex-wrap gap-3">
            <CreateDatabaseDialog defaultScope="workspace" />
            <Button
              variant="outline"
              size="sm"
              disabled={notesBusy}
              onClick={() => void createPersonalNotes()}
            >
              {notesBusy ? 'Creating…' : 'Create personal notes'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/agents')}
            >
              Connect an agent
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 p-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
