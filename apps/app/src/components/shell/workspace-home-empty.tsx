'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CreateDatabaseDialog } from '@/components/collection/create-database-dialog';
import { OperateEmptyState } from '@/components/operate/empty-state';
import { Button } from '@/components/ui/button';
import { useWorkspaceSession } from '@/lib/workspace-session';

export function WorkspaceHomeEmpty({
  kind,
  message,
  memberOnly = false,
}: {
  kind: 'empty' | 'error';
  message?: string;
  memberOnly?: boolean;
}) {
  const router = useRouter();
  const { refresh } = useWorkspaceSession();
  const [notesBusy, setNotesBusy] = useState(false);
  const [notesError, setNotesError] = useState('');

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
      await refresh();
      router.push('/c/notes');
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : 'Create failed');
      setNotesBusy(false);
    }
  }

  if (kind === 'error') {
    return (
      <OperateEmptyState
        className="px-6"
        title="Workspace unavailable"
        description={
          message ?? 'Could not load your workspace. Refresh or sign in again.'
        }
        action={
          <Button
            variant="outline"
            onClick={() => {
              void refresh();
            }}
          >
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <OperateEmptyState
      className="px-6"
      title={
        memberOnly
          ? 'No databases shared with you yet'
          : 'Your shared workspace is ready'
      }
      description={
        memberOnly
          ? 'Access follows collection grants and page shares. Ask a workspace owner or admin for access, or wait for a shared database.'
          : 'People and agents share the same collections — grants scope access, agents propose changes, and you review in Changes. Create a workspace database, personal notes, or connect an agent to start.'
      }
      action={
        memberOnly ? undefined : (
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
