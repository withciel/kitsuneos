'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ACCESS_LEVELS,
  type AccessLevel,
  accessDescription,
  accessLabel,
} from '@/lib/access-labels';
import { cn } from '@/lib/utils';

type Scope = 'workspace' | 'collection' | 'page';

interface CollectionRow {
  id: string;
  name: string;
}

interface GrantRow {
  id: string;
  principalId: string;
  collection: string;
  capability: string;
  fieldMask: string[] | null;
  revokedAt: string | null;
}

interface SearchResult {
  collection: string;
  recordId: string;
  label: string;
}

/**
 * Shared access control surface: capability chips (No Access / Read Only /
 * Change Request / Full write / Full control) + a scope picker (workspace /
 * database / page). Used from Agents profiles, Settings → Access, and the
 * page Share dialog wherever a single grantee's access needs editing.
 */
export function AccessEditor({
  principalId,
  principalLabel,
  className,
}: {
  principalId: string;
  principalLabel?: string;
  className?: string;
}) {
  const [scope, setScope] = useState<Scope>('collection');
  const [capability, setCapability] = useState<AccessLevel>('propose');
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [collectionId, setCollectionId] = useState('');
  const [pageQuery, setPageQuery] = useState('');
  const [pageResults, setPageResults] = useState<SearchResult[]>([]);
  const [selectedPage, setSelectedPage] = useState<SearchResult | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const myGrants = useMemo(
    () => grants.filter((g) => g.principalId === principalId && !g.revokedAt),
    [grants, principalId],
  );

  const reload = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/api/grants');
      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      const body = (await response.json()) as {
        grants?: GrantRow[];
        collections?: CollectionRow[];
        error?: string;
      };
      if (!response.ok) {
        setError(body.error ?? 'Could not load access');
        return;
      }
      setForbidden(false);
      setGrants(body.grants ?? []);
      setCollections(body.collections ?? []);
      setCollectionId((prev) => prev || body.collections?.[0]?.id || '');
    } catch {
      setError('Could not load access');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (scope !== 'page' || pageQuery.trim().length < 2) {
      setPageResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/search?q=${encodeURIComponent(pageQuery)}&limit=8`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          const body = (await response.json()) as {
            results?: Array<{
              collection: string;
              recordId: string;
              label: string;
            }>;
          };
          setPageResults(
            (body.results ?? []).map((r) => ({
              collection: r.collection,
              recordId: r.recordId,
              label: r.label,
            })),
          );
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [scope, pageQuery]);

  function grantFor(collectionName: string): GrantRow | undefined {
    return myGrants.find((g) => g.collection === collectionName);
  }

  async function setCollectionAccess(collId: string, level: AccessLevel) {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const collectionName = collections.find((c) => c.id === collId)?.name;
      const existing = collectionName ? grantFor(collectionName) : undefined;
      if (level === 'none') {
        if (existing) {
          const response = await fetch('/api/grants', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ grantId: existing.id }),
          });
          if (!response.ok) {
            const body = (await response.json()) as { error?: string };
            throw new Error(body.error ?? 'Could not remove access');
          }
        }
        return;
      }
      const response = await fetch('/api/grants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          principalId,
          collectionId: collId,
          capability: level,
        }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? 'Could not save access');
      }
    } finally {
      setBusy(false);
    }
  }

  async function applyCollectionScope() {
    if (!collectionId) {
      setError('Pick a database.');
      return;
    }
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await setCollectionAccess(collectionId, capability);
      setStatus(
        `${accessLabel(capability)} on ${collections.find((c) => c.id === collectionId)?.name ?? 'database'}.`,
      );
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save access');
    } finally {
      setBusy(false);
    }
  }

  async function applyWorkspaceScope() {
    if (collections.length === 0) {
      setError('No databases yet.');
      return;
    }
    setBusy(true);
    setError('');
    setStatus('');
    try {
      for (const collection of collections) {
        await setCollectionAccess(collection.id, capability);
      }
      setStatus(
        `${accessLabel(capability)} on all ${collections.length} current database${collections.length === 1 ? '' : 's'}.`,
      );
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save access');
    } finally {
      setBusy(false);
    }
  }

  async function applyPageScope() {
    if (!selectedPage) {
      setError('Search for and pick a page first.');
      return;
    }
    setBusy(true);
    setError('');
    setStatus('');
    try {
      if (capability === 'none') {
        const response = await fetch('/api/pages/access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            collection: selectedPage.collection,
            recordId: selectedPage.recordId,
            unsharePrincipalId: principalId,
          }),
        });
        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          throw new Error(body.error ?? 'Could not remove page access');
        }
      } else {
        // Page ACL only stores read | full; map Full write → full.
        const pageCapability = capability === 'write' ? 'full' : 'read';
        const response = await fetch('/api/pages/access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            collection: selectedPage.collection,
            recordId: selectedPage.recordId,
            visibility: 'shared',
            share: { principalId, capability: pageCapability },
          }),
        });
        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          throw new Error(body.error ?? 'Could not share page');
        }
      }
      setStatus(
        capability === 'none'
          ? `Removed explicit page share for “${selectedPage.label}” (inherited access may remain).`
          : `${accessLabel(capability)} on “${selectedPage.label}”.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save access');
    } finally {
      setBusy(false);
    }
  }

  if (forbidden) {
    return (
      <div className={cn('rounded-lg border border-border p-4', className)}>
        <p className="text-sm text-muted-foreground">
          Only workspace owners and admins can manage access
          {principalLabel ? ` for ${principalLabel}` : ''}.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn('space-y-4 rounded-lg border border-border p-4', className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Access</h3>
        <div className="flex gap-1">
          {(
            [
              ['workspace', 'Workspace'],
              ['collection', 'Database'],
              ['page', 'Page'],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={scope === value ? 'default' : 'outline'}
              onClick={() => setScope(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {ACCESS_LEVELS.filter((level) => {
          // Page shares only support none / read / full (write maps to full).
          if (scope !== 'page') return true;
          return (
            level.value === 'none' ||
            level.value === 'read' ||
            level.value === 'write'
          );
        }).map((level) => (
          <Button
            key={level.value}
            size="sm"
            variant={capability === level.value ? 'default' : 'outline'}
            onClick={() => setCapability(level.value)}
            title={
              scope === 'page' && level.value === 'none'
                ? 'Removes an explicit page share. Inherited collection access still applies.'
                : level.description
            }
          >
            {level.label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {scope === 'page' && capability === 'none'
          ? 'Removes an explicit page share only. Collection or workspace grants still apply.'
          : accessDescription(capability)}
      </p>

      {scope === 'collection' ? (
        <div className="flex flex-wrap items-end gap-2">
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
          <Button
            size="sm"
            disabled={busy || !collectionId}
            onClick={() => void applyCollectionScope()}
          >
            {busy ? 'Saving…' : 'Apply'}
          </Button>
        </div>
      ) : null}

      {scope === 'workspace' ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">
            Applies to all {collections.length} current database
            {collections.length === 1 ? '' : 's'} — not future ones.
          </p>
          <Button
            size="sm"
            disabled={busy || collections.length === 0}
            onClick={() => void applyWorkspaceScope()}
          >
            {busy ? 'Saving…' : 'Apply to workspace'}
          </Button>
        </div>
      ) : null}

      {scope === 'page' ? (
        <div className="space-y-2">
          <Label>Page</Label>
          <Input
            value={selectedPage ? selectedPage.label : pageQuery}
            onChange={(event) => {
              setSelectedPage(null);
              setPageQuery(event.target.value);
            }}
            placeholder="Search pages by title…"
          />
          {pageResults.length > 0 && !selectedPage ? (
            <ul className="max-h-40 overflow-auto rounded-md border border-border">
              {pageResults.map((result) => (
                <li key={`${result.collection}:${result.recordId}`}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      setSelectedPage(result);
                      setPageResults([]);
                    }}
                  >
                    <span>{result.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {result.collection}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <Button
            size="sm"
            disabled={busy || !selectedPage}
            onClick={() => void applyPageScope()}
          >
            {busy ? 'Saving…' : 'Apply to page'}
          </Button>
        </div>
      ) : null}

      {scope !== 'page' ? (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Current database access
          </Label>
          {myGrants.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No database access yet.
            </p>
          ) : (
            <ul className="space-y-1">
              {myGrants.map((grant) => (
                <li
                  key={grant.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1 text-sm"
                >
                  <span className="font-medium">{grant.collection}</span>
                  <span className="text-xs text-muted-foreground">
                    {accessLabel(grant.capability)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {status ? <p className="text-xs text-emerald-600">{status}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
