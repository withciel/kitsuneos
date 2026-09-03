'use client';

import { useCallback, useEffect, useState } from 'react';
import { SettingsNav } from '@/components/settings/settings-nav';
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

interface GrantRow {
  id: string;
  principalId: string;
  collectionId: string;
  capability: string;
  fieldMask: string[] | null;
}

export default function SettingsGrantsPage() {
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [principals, setPrincipals] = useState<
    Array<{ id: string; display_name: string; kind: string }>
  >([]);
  const [collections, setCollections] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [error, setError] = useState('');
  const [principalId, setPrincipalId] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [capability, setCapability] = useState('read');

  const reload = useCallback(async () => {
    const response = await fetch('/api/grants');
    const body = (await response.json()) as {
      grants?: GrantRow[];
      principals?: Array<{ id: string; display_name: string; kind: string }>;
      collections?: Array<{ id: string; name: string }>;
      error?: string;
    };
    if (!response.ok) {
      setError(body.error ?? 'Failed to load grants');
      return;
    }
    setGrants(body.grants ?? []);
    setPrincipals(body.principals ?? []);
    setCollections(body.collections ?? []);
    setPrincipalId((prev) => prev || body.principals?.[0]?.id || '');
    setCollectionId((prev) => prev || body.collections?.[0]?.id || '');
  }, []);

  useEffect(() => {
    void reload().catch(() => setError('Failed to load grants'));
  }, [reload]);

  function labelPrincipal(id: string): string {
    return principals.find((p) => p.id === id)?.display_name ?? id.slice(0, 8);
  }
  function labelCollection(id: string): string {
    return collections.find((c) => c.id === id)?.name ?? id.slice(0, 8);
  }

  async function createGrant() {
    setError('');
    try {
      const response = await fetch('/api/grants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ principalId, collectionId, capability }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? 'Create failed');
        return;
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  async function revoke(grantId: string) {
    setError('');
    try {
      const response = await fetch('/api/grants', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grantId }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? 'Revoke failed');
        return;
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revoke failed');
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <SettingsNav />
      <div className="space-y-6 p-6">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Principal</TableHead>
              <TableHead>Collection</TableHead>
              <TableHead>Capability</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {grants.map((grant) => (
              <TableRow key={grant.id}>
                <TableCell>{labelPrincipal(grant.principalId)}</TableCell>
                <TableCell>{labelCollection(grant.collectionId)}</TableCell>
                <TableCell>{grant.capability}</TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void revoke(grant.id)}
                  >
                    Revoke
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
          <div className="space-y-1">
            <Label>Principal</Label>
            <Select value={principalId} onValueChange={setPrincipalId}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {principals.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Collection</Label>
            <Select value={collectionId} onValueChange={setCollectionId}>
              <SelectTrigger className="w-48">
                <SelectValue />
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
            <Label>Capability</Label>
            <Select value={capability} onValueChange={setCapability}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['read', 'propose', 'write', 'admin'].map((cap) => (
                  <SelectItem key={cap} value={cap}>
                    {cap}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => void createGrant()}>Create grant</Button>
        </div>
      </div>
    </div>
  );
}
