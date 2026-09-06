'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isValidSchemaName } from '@/lib/schema-names';
import { notifyWorkspaceChanged } from '@/lib/workspace-events';

export function CreateDatabaseDialog({
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = controlledOnOpenChange ?? setUncontrolledOpen;
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function createDatabase() {
    const trimmed = name.trim();
    if (!isValidSchemaName(trimmed)) {
      setError('Use a simple lowercase name like accounts or deals.');
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
      setOpen(false);
      setName('');
      router.push(`/c/${trimmed}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError('');
          setName('');
        }
      }}
    >
      {trigger !== undefined ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : controlledOpen === undefined ? (
        <DialogTrigger asChild>
          <Button size="sm">Create database</Button>
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a database</DialogTitle>
          <DialogDescription>
            Databases hold pages in a table. You can add properties after
            opening it.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void createDatabase();
          }}
        >
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="space-y-1.5">
            <Label htmlFor="create-database-name">Name</Label>
            <Input
              id="create-database-name"
              name="databaseName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. accounts…"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? 'Creating…' : 'Create database'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
