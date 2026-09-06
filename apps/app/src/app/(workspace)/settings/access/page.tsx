'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SettingsNav } from '@/components/settings/settings-nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ACCESS_LEVELS,
  type AccessLevel,
  accessDescription,
  accessLabel,
  personKindLabel,
} from '@/lib/access-labels';

interface GrantRow {
  id: string;
  principalId: string;
  /** Collection name from the API (not an id). */
  collection: string;
  capability: string;
  fieldMask: string[] | null;
  revokedAt: string | null;
}

interface PrincipalRow {
  id: string;
  display_name: string;
  kind: string;
}

interface CollectionRow {
  id: string;
  name: string;
}

export default function SettingsAccessPage() {
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [principals, setPrincipals] = useState<PrincipalRow[]>([]);
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [principalId, setPrincipalId] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [capability, setCapability] = useState<AccessLevel>('propose');

  const selectedPrincipal = useMemo(
    () => principals.find((p) => p.id === principalId),
    [principals, principalId],
  );

  const availableLevels = useMemo(() => {
    if (selectedPrincipal?.kind === 'agent') {
      return ACCESS_LEVELS.filter((level) => !level.humansOnly);
    }
    return ACCESS_LEVELS;
  }, [selectedPrincipal]);

  const reload = useCallback(async () => {
    const response = await fetch('/api/grants');
    const body = (await response.json()) as {
      grants?: GrantRow[];
      principals?: PrincipalRow[];
      collections?: CollectionRow[];
      error?: string;
    };
    if (!response.ok) {
      setError(
        response.status === 403
          ? 'Only workspace owners and admins can manage Access. Ask an owner to promote you or make the change.'
          : (body.error ?? 'Could not load access'),
      );
      return;
    }
    setError('');
    setGrants((body.grants ?? []).filter((grant) => !grant.revokedAt));
    setPrincipals(body.principals ?? []);
    setCollections(body.collections ?? []);
    setPrincipalId((prev) => prev || body.principals?.[0]?.id || '');
    setCollectionId((prev) => prev || body.collections?.[0]?.id || '');
  }, []);

  useEffect(() => {
    void reload().catch(() => setError('Could not load access settings'));
  }, [reload]);

  useEffect(() => {
    if (
      selectedPrincipal?.kind === 'agent' &&
      (capability === 'write' || capability === 'admin')
    ) {
      setCapability('propose');
    }
  }, [selectedPrincipal, capability]);

  function labelPrincipal(id: string): string {
    return principals.find((p) => p.id === id)?.display_name ?? 'Unknown';
  }

  function kindFor(id: string): string {
    return principals.find((p) => p.id === id)?.kind ?? 'human';
  }

  async function createAccess() {
    if (!principalId || !collectionId) {
      setError('Pick who and which database.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/grants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ principalId, collectionId, capability }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(friendlyGrantError(body.error ?? 'Could not save access'));
        return;
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save access');
    } finally {
      setBusy(false);
    }
  }

  async function removeAccess(grantId: string) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/grants', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grantId }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? 'Could not remove access');
        return;
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove access');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <SettingsNav />
      <div className="mx-auto w-full max-w-3xl space-y-8 p-6">
        <div className="space-y-2">
          <h2 className="text-lg font-medium">Who can access what</h2>
          <p className="text-sm text-muted-foreground">
            Give people and AI helpers permission to view or suggest changes in
            each database. Suggested changes show up in Inbox for you to
            approve.
          </p>
        </div>

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Who</TableHead>
                <TableHead>Database</TableHead>
                <TableHead>Access</TableHead>
                <TableHead className="w-[1%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {grants.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    No access rules yet. Add a person or AI helper, pick a
                    database, and choose what they can do. Add one below.
                  </TableCell>
                </TableRow>
              ) : (
                grants.map((grant) => (
                  <TableRow key={grant.id}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">
                          {labelPrincipal(grant.principalId)}
                        </span>
                        <Badge
                          variant="secondary"
                          className="w-fit text-[10px]"
                        >
                          {personKindLabel(kindFor(grant.principalId))}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {grant.collection}
                      {grant.fieldMask && grant.fieldMask.length > 0 ? (
                        <p className="mt-1 text-xs font-normal text-muted-foreground">
                          Only columns: {grant.fieldMask.join(', ')}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <span>{accessLabel(grant.capability)}</span>
                        <p className="text-xs text-muted-foreground">
                          {accessDescription(grant.capability)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void removeAccess(grant.id)}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-4 rounded-lg border border-border p-4">
          <div>
            <h3 className="text-sm font-medium">Add access</h3>
            <p className="text-xs text-muted-foreground">
              AI helpers are limited to viewing or suggesting — they cannot edit
              directly from this screen.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>Who</Label>
              <Select value={principalId} onValueChange={setPrincipalId}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  {principals.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.display_name} ({personKindLabel(p.kind)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Database</Label>
              <Select value={collectionId} onValueChange={setCollectionId}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  {collections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Access level</Label>
              <Select
                value={capability}
                onValueChange={(value) => setCapability(value as AccessLevel)}
              >
                <SelectTrigger className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableLevels.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button disabled={busy} onClick={() => void createAccess()}>
              {busy ? 'Saving…' : 'Add access'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {accessDescription(capability)}
          </p>
        </div>
      </div>
    </div>
  );
}

function friendlyGrantError(message: string): string {
  if (/Agent principals cannot be granted write/i.test(message)) {
    return 'AI helpers can only view or suggest changes. Pick “Suggest changes” instead.';
  }
  return message;
}
