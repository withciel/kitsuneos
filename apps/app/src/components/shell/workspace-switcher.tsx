'use client';

import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  notifyWorkspaceChanged,
  WORKSPACE_CHANGED_EVENT,
} from '@/lib/workspace-events';

interface WorkspaceMembershipRow {
  workspaceId: string;
  workspaceName: string;
  role: string;
  principalId: string;
  active: boolean;
}

export function WorkspaceSwitcher() {
  const router = useRouter();
  const [memberships, setMemberships] = useState<WorkspaceMembershipRow[]>([]);
  const [activeName, setActiveName] = useState('Workspace');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const reload = useCallback(() => {
    void fetch('/api/workspaces')
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as {
          activeWorkspaceName?: string | null;
          memberships?: WorkspaceMembershipRow[];
        };
        setMemberships(body.memberships ?? []);
        setActiveName(body.activeWorkspaceName?.trim() || 'Workspace');
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    reload();
    window.addEventListener(WORKSPACE_CHANGED_EVENT, reload);
    return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, reload);
  }, [reload]);

  async function switchTo(workspaceId: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/workspaces/switch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
      const body = (await response.json()) as {
        error?: string;
        workspaceName?: string;
      };
      if (!response.ok) {
        setError(body.error ?? 'Could not switch workspace');
        return;
      }
      setActiveName(body.workspaceName?.trim() || 'Workspace');
      notifyWorkspaceChanged();
      reload();
      router.refresh();
      router.push('/');
    } finally {
      setBusy(false);
    }
  }

  async function createWorkspace() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() || undefined }),
      });
      const body = (await response.json()) as {
        error?: string;
        workspaceName?: string;
      };
      if (!response.ok) {
        setError(body.error ?? 'Could not create workspace');
        return;
      }
      setActiveName(body.workspaceName?.trim() || 'Workspace');
      setCreateOpen(false);
      setNewName('');
      notifyWorkspaceChanged();
      reload();
      router.refresh();
      router.push('/');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-between px-2 text-left font-medium"
            disabled={busy}
          >
            <span className="truncate group-data-[collapsible=icon]:hidden">
              {activeName}
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {memberships.map((membership) => (
            <DropdownMenuItem
              key={membership.workspaceId}
              onClick={() => {
                if (!membership.active) {
                  void switchTo(membership.workspaceId);
                }
              }}
              className="justify-between gap-2"
            >
              <span className="truncate">{membership.workspaceName}</span>
              {membership.active ? <Check className="size-3.5" /> : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setCreateOpen(true);
            }}
          >
            <Plus className="size-3.5" />
            Create workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && !createOpen ? (
        <p className="mt-1 px-1 text-[11px] text-destructive">{error}</p>
      ) : null}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setNewName('');
            setError('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
            <DialogDescription>
              Workspaces isolate databases, people, and agent access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-workspace-name">Name</Label>
            <Input
              id="new-workspace-name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Acme Research"
              disabled={busy}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void createWorkspace();
                }
              }}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void createWorkspace()}
            >
              {busy ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
