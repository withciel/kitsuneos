'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CreateDatabaseDialog } from '@/components/collection/create-database-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function WorkspaceHomePage() {
  const router = useRouter();
  const [empty, setEmpty] = useState(false);
  const [memberOnlyEmpty, setMemberOnlyEmpty] = useState(false);
  const [bootError, setBootError] = useState('');

  useEffect(() => {
    void fetch('/api/schema')
      .then(async (response) => {
        if (response.status === 401) {
          // App auth path — do not bounce expired sessions to marketing `/`.
          window.location.assign('/login');
          return;
        }
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          setBootError(
            body.error ??
              'Could not load your workspace. Refresh or sign in again.',
          );
          return;
        }
        const body = (await response.json()) as {
          collections?: Array<{ name: string }>;
        };
        const first = body.collections?.[0]?.name;
        if (first) {
          router.replace(`/c/${first}`);
        } else {
          setEmpty(true);
          try {
            const meRes = await fetch('/api/me');
            const meBody = (await meRes.json()) as { role?: string };
            setMemberOnlyEmpty(
              meBody.role === 'member' || meBody.role === 'viewer',
            );
          } catch {
            setMemberOnlyEmpty(false);
          }
        }
      })
      .catch(() =>
        setBootError(
          'Could not reach the workspace API. Check your connection and retry.',
        ),
      );
  }, [router]);

  if (bootError) {
    return (
      <div className="flex flex-1 flex-col items-start gap-4 p-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Workspace unavailable
        </h1>
        <p className="max-w-md text-sm text-destructive">{bootError}</p>
        <Button
          variant="outline"
          onClick={() => {
            setBootError('');
            window.location.reload();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (empty) {
    return (
      <div className="flex flex-1 flex-col items-start gap-6 p-8">
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Step 1 of 4 · First win
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {memberOnlyEmpty
              ? 'No databases shared with you yet'
              : 'Create your first database'}
          </h1>
          <p className="max-w-lg text-sm text-muted-foreground">
            {memberOnlyEmpty
              ? 'This workspace may already have databases, but none are shared with your account yet. Ask a workspace owner or admin to grant you access under Settings → Access.'
              : 'A database is a shared table for you and your AI helpers. Start here — next you will add a page, connect an agent, and review proposals in Inbox. You can add properties after you open the database.'}
          </p>
        </div>
        {memberOnlyEmpty ? null : <CreateDatabaseDialog />}
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
