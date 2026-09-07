'use client';

import { Bot, GitPullRequest, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SettingsNav } from '@/components/settings/settings-nav';
import {
  SettingsCallout,
  SettingsPageHeader,
  SettingsSection,
} from '@/components/settings/settings-section';
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

  // Agents and people share the same capability ladder; "No Access" only
  // makes sense when removing a grant, not when adding one.
  const availableLevels = useMemo(
    () => ACCESS_LEVELS.filter((level) => level.value !== 'none'),
    [],
  );

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
        setError(body.error ?? 'Could not save access');
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
      <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
        <SettingsPageHeader
          icon={ShieldCheck}
          title="Access"
          description="Give people and AI agents permission to view or change records in each database. Change Request access lands in Changes for a reviewer to approve."
        />

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <SettingsSection
          title={`Current access${grants.length ? ` (${grants.length})` : ''}`}
        >
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
                      No access rules yet. Add one below.
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
        </SettingsSection>

        <SettingsSection
          title="Add access"
          description="Pick the lowest level that gets the job done — Change Request is the safest default for AI agents."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Who</Label>
              <Select value={principalId} onValueChange={setPrincipalId}>
                <SelectTrigger className="w-full">
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
            <div className="space-y-1.5">
              <Label>Database</Label>
              <Select value={collectionId} onValueChange={setCollectionId}>
                <SelectTrigger className="w-full">
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
            <div className="space-y-1.5">
              <Label>Access level</Label>
              <Select
                value={capability}
                onValueChange={(value) => setCapability(value as AccessLevel)}
              >
                <SelectTrigger className="w-full">
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
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              {accessDescription(capability)}
            </p>
            <Button disabled={busy} onClick={() => void createAccess()}>
              {busy ? 'Saving…' : 'Add access'}
            </Button>
          </div>
        </SettingsSection>

        <SettingsCallout icon={Bot}>
          Don&apos;t see the AI agent you want to grant access to? Create it
          first on the{' '}
          <a href="/agents" className="text-primary underline">
            Agents
          </a>{' '}
          page.
        </SettingsCallout>
        <SettingsCallout icon={GitPullRequest}>
          Proposals from &ldquo;Change Request&rdquo; access wait in{' '}
          <a href="/changes" className="text-primary underline">
            Changes
          </a>{' '}
          for review.
        </SettingsCallout>
      </div>
    </div>
  );
}
