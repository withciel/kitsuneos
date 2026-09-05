'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { notifyWorkspaceChanged } from '@/lib/workspace-events';

const COLLECTION_NAME_RE = /^[a-z_][a-z0-9_]*$/;

export default function WorkspaceHomePage() {
  const router = useRouter();
  const [empty, setEmpty] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetch('/api/schema')
      .then(async (response) => {
        if (response.status === 401) {
          // App auth path — do not bounce expired sessions to marketing `/`.
          window.location.assign('/login');
          return;
        }
        if (!response.ok) {
          setEmpty(true);
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
        }
      })
      .catch(() => setEmpty(true));
  }, [router]);

  async function createFirstCollection() {
    const trimmed = name.trim();
    if (!COLLECTION_NAME_RE.test(trimmed)) {
      setError('Use a lowercase name like accounts or deals.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          fields: [{ name: 'name', type: 'text', nullable: false }],
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Create failed');
      notifyWorkspaceChanged();
      router.push(`/c/${trimmed}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (empty) {
    return (
      <div className="flex flex-1 flex-col items-start gap-4 p-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Create your first collection
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Collections are tables you and agents share. Start with a name; you
            can add fields in Settings.
          </p>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <form
          className="flex w-full max-w-sm flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void createFirstCollection();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="first-collection">Collection name</Label>
            <Input
              id="first-collection"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="accounts"
              autoComplete="off"
            />
          </div>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Create collection'}
          </Button>
        </form>
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
