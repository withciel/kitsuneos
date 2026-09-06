'use client';

import type { PageShareCapability, PageVisibility } from '@kitsuneos/core';
import { useCallback, useEffect, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ShareTarget {
  principalId: string;
  label: string;
  kind: 'person' | 'team';
}

interface AccessState {
  visibility: PageVisibility;
  ownerPrincipalId: string;
  shares: Array<{ principalId: string; capability: PageShareCapability }>;
}

export function ShareDialog({
  collection,
  recordId,
}: {
  collection: string;
  recordId: string;
}) {
  const [open, setOpen] = useState(false);
  const [access, setAccess] = useState<AccessState | null>(null);
  const [targets, setTargets] = useState<ShareTarget[]>([]);
  const [visibility, setVisibility] = useState<PageVisibility>('workspace');
  const [sharePrincipalId, setSharePrincipalId] = useState('');
  const [shareCapability, setShareCapability] =
    useState<PageShareCapability>('read');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setError('');
    const [accessRes, targetsRes] = await Promise.all([
      fetch(
        `/api/pages/access?collection=${encodeURIComponent(collection)}&recordId=${encodeURIComponent(recordId)}`,
      ),
      fetch('/api/share-targets'),
    ]);
    const accessBody = (await accessRes.json()) as {
      access?: AccessState;
      error?: string;
    };
    const targetsBody = (await targetsRes.json()) as {
      targets?: ShareTarget[];
      error?: string;
    };
    if (!accessRes.ok) {
      setError(accessBody.error ?? 'Could not load sharing');
      return;
    }
    if (!targetsRes.ok) {
      setError(targetsBody.error ?? 'Could not load people and teams');
      return;
    }
    const next = accessBody.access ?? {
      visibility: 'workspace' as const,
      ownerPrincipalId: '',
      shares: [],
    };
    setAccess(next);
    setVisibility(next.visibility);
    setTargets(targetsBody.targets ?? []);
  }, [collection, recordId]);

  useEffect(() => {
    if (!open) return;
    void reload();
  }, [open, reload]);

  async function saveVisibility(next: PageVisibility) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/pages/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection,
          recordId,
          visibility: next,
        }),
      });
      const body = (await response.json()) as {
        access?: AccessState;
        error?: string;
      };
      if (!response.ok) {
        setError(body.error ?? 'Could not update visibility');
        return;
      }
      if (body.access) {
        setAccess(body.access);
        setVisibility(body.access.visibility);
      }
    } finally {
      setBusy(false);
    }
  }

  async function addShare() {
    if (!sharePrincipalId) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/pages/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection,
          recordId,
          share: {
            principalId: sharePrincipalId,
            capability: shareCapability,
          },
        }),
      });
      const body = (await response.json()) as {
        access?: AccessState;
        error?: string;
      };
      if (!response.ok) {
        setError(body.error ?? 'Could not share');
        return;
      }
      if (body.access) {
        setAccess(body.access);
        setVisibility(body.access.visibility);
      }
      setSharePrincipalId('');
    } finally {
      setBusy(false);
    }
  }

  async function removeShare(principalId: string) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/pages/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection,
          recordId,
          unsharePrincipalId: principalId,
        }),
      });
      const body = (await response.json()) as {
        access?: AccessState;
        error?: string;
      };
      if (!response.ok) {
        setError(body.error ?? 'Could not remove share');
        return;
      }
      if (body.access) {
        setAccess(body.access);
        setVisibility(body.access.visibility);
      }
    } finally {
      setBusy(false);
    }
  }

  const labelFor = (principalId: string) =>
    targets.find((t) => t.principalId === principalId)?.label ??
    principalId.slice(0, 8);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share page</DialogTitle>
          <DialogDescription>
            Private (only you), workspace (everyone here), or shared with
            specific people and teams.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="page-visibility">Visibility</Label>
            <Select
              value={visibility}
              disabled={busy}
              onValueChange={(value) => {
                const next = value as PageVisibility;
                setVisibility(next);
                void saveVisibility(next);
              }}
            >
              <SelectTrigger id="page-visibility" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="workspace">Workspace</SelectItem>
                <SelectItem value="shared">Shared</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {visibility === 'shared' ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>People and teams with access</Label>
                {(access?.shares ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No one shared yet — add a person or team below.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {(access?.shares ?? []).map((share) => (
                      <li
                        key={share.principalId}
                        className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-sm"
                      >
                        <span>
                          {labelFor(share.principalId)}{' '}
                          <span className="text-muted-foreground">
                            ({share.capability})
                          </span>
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void removeShare(share.principalId)}
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <Select
                  value={sharePrincipalId || undefined}
                  onValueChange={setSharePrincipalId}
                  disabled={busy}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Person or team" />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map((target) => (
                      <SelectItem
                        key={target.principalId}
                        value={target.principalId}
                      >
                        {target.kind === 'team' ? 'Team: ' : ''}
                        {target.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={shareCapability}
                  onValueChange={(value) =>
                    setShareCapability(value as PageShareCapability)
                  }
                  disabled={busy}
                >
                  <SelectTrigger className="w-[7rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read">Read</SelectItem>
                    <SelectItem value="write">Write</SelectItem>
                    <SelectItem value="full">Full</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={busy || !sharePrincipalId}
                  onClick={() => void addShare()}
                >
                  Add
                </Button>
              </div>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
