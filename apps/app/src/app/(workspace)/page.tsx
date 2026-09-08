'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CreateDatabaseDialog } from '@/components/collection/create-database-dialog';
import { OperateEmptyState } from '@/components/operate/empty-state';
import { OperateLoadingBlock } from '@/components/operate/loading-block';
import { Button } from '@/components/ui/button';

type BootState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'empty'; memberOnly: boolean }
  | { kind: 'redirecting' };

export default function WorkspaceHomePage() {
  const router = useRouter();
  const [boot, setBoot] = useState<BootState>({ kind: 'loading' });
  const [notesBusy, setNotesBusy] = useState(false);
  const [notesError, setNotesError] = useState('');

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
          const first = body.collections?.[0]?.name;
          if (first) {
            setBoot({ kind: 'redirecting' });
            router.replace(`/c/${first}`);
            return;
          }
        }
        try {
          const meRes = await fetch('/api/me');
          const meBody = (await meRes.json()) as { role?: string };
          setBoot({
            kind: 'empty',
            memberOnly: meBody.role === 'member' || meBody.role === 'viewer',
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
    setNotesError('');
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
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : 'Create failed');
      setNotesBusy(false);
    }
  }

  if (boot.kind === 'error') {
    return (
      <OperateEmptyState
        className="px-6"
        title="Workspace unavailable"
        description={boot.message}
        action={
          <Button
            variant="outline"
            onClick={() => {
              setBoot({ kind: 'loading' });
              window.location.reload();
            }}
          >
            Retry
          </Button>
        }
      />
    );
  }

  if (boot.kind === 'empty') {
    return (
      <OperateEmptyState
        className="px-6"
        title={
          boot.memberOnly
            ? 'No databases shared with you yet'
            : 'Your shared workspace is ready'
        }
        description={
          boot.memberOnly
            ? 'Access follows collection grants and page shares. Ask a workspace owner or admin for access, or wait for a shared database.'
            : 'People and agents share the same collections — grants scope access, agents propose changes, and you review in Changes. Create a workspace database, personal notes, or connect an agent to start.'
        }
        action={
          boot.memberOnly ? undefined : (
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
              {notesError ? (
                <p className="basis-full text-sm text-destructive">
                  {notesError}
                </p>
              ) : null}
            </div>
          )
        }
      />
    );
  }

  return <OperateLoadingBlock rows={2} />;
}
