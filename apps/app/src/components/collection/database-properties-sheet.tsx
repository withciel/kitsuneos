'use client';

import { useCallback, useEffect, useState } from 'react';
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { isValidSchemaName } from '@/lib/schema-names';
import { notifyWorkspaceChanged } from '@/lib/workspace-events';

interface PropertyMeta {
  name: string;
  type: string;
  relationTarget?: string | null;
}

interface DatabaseMeta {
  name: string;
  fields: PropertyMeta[];
}

const PROPERTY_TYPES = [
  'text',
  'number',
  'boolean',
  'enum',
  'relation',
  'prose',
] as const;

async function mutateSchema(payload: Record<string, unknown>) {
  const response = await fetch('/api/schema/mutate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as {
    error?: string;
    preview?: { incompatibleChangeSetIds?: string[] };
    requiresConfirmation?: boolean;
  };
  if (
    response.status === 409 &&
    body.requiresConfirmation &&
    body.preview?.incompatibleChangeSetIds?.length
  ) {
    const ids = body.preview.incompatibleChangeSetIds;
    const ok = window.confirm(
      `This change will mark ${ids.length} open change set(s) as stale. Continue?`,
    );
    if (!ok) throw new Error('Cancelled');
    return mutateSchema({ ...payload, confirmStaleIds: ids });
  }
  if (!response.ok) {
    throw new Error(body.error ?? 'Could not update properties');
  }
}

export function DatabasePropertiesSheet({
  collection,
  open,
  onOpenChange,
  onChanged,
}: {
  collection: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const [databases, setDatabases] = useState<DatabaseMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] =
    useState<(typeof PROPERTY_TYPES)[number]>('text');
  const [newEnumValues, setNewEnumValues] = useState('');
  const [newRelationTarget, setNewRelationTarget] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/schema');
      const body = (await response.json()) as {
        collections?: DatabaseMeta[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? 'Failed to load properties');
      }
      setDatabases(body.collections ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setError('');
    setNewName('');
    setNewType('text');
    setNewEnumValues('');
    setNewRelationTarget('');
    void reload();
  }, [open, reload]);

  const current = databases.find((item) => item.name === collection);

  async function addProperty() {
    const trimmedName = newName.trim();
    if (!trimmedName) return;
    if (!isValidSchemaName(trimmedName)) {
      setError('Use a simple lowercase name like status or owner_id.');
      return;
    }
    const enumValues =
      newType === 'enum'
        ? newEnumValues
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        : [];
    if (newType === 'enum' && enumValues.length === 0) {
      setError('Choice properties need at least one option');
      return;
    }
    if (newType === 'relation' && !newRelationTarget) {
      setError('Relation properties need a related database');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await mutateSchema({
        collection,
        op: 'addField',
        field: {
          name: trimmedName,
          type: newType,
          ...(newType === 'enum' ? { enumValues } : {}),
          ...(newType === 'relation'
            ? { relationTarget: newRelationTarget }
            : {}),
        },
      });
      setNewName('');
      setNewEnumValues('');
      setNewRelationTarget('');
      notifyWorkspaceChanged();
      await reload();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeProperty(name: string) {
    const ok = window.confirm(
      `Remove property "${name}" from ${collection}? This cannot be undone.`,
    );
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      await mutateSchema({
        collection,
        op: 'dropField',
        fieldName: name,
      });
      notifyWorkspaceChanged();
      await reload();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <SheetTitle>Properties</SheetTitle>
          <SheetDescription>
            Add or remove properties for {collection}.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {(current?.fields ?? []).map((property) => (
                <li
                  key={property.name}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{property.name}</span>
                    <span className="ml-2 text-muted-foreground">
                      {property.type === 'enum'
                        ? 'choice'
                        : property.type === 'prose'
                          ? 'long text'
                          : property.type}
                      {property.type === 'relation' && property.relationTarget
                        ? ` → ${property.relationTarget}`
                        : ''}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void removeProperty(property.name)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
              {(current?.fields.length ?? 0) === 0 ? (
                <li className="px-3 py-4 text-sm text-muted-foreground">
                  No properties yet.
                </li>
              ) : null}
            </ul>
          )}

          <div className="space-y-3 rounded-md border border-border p-3">
            <p className="text-sm font-medium">Add property</p>
            <div className="space-y-1.5">
              <Label htmlFor="property-name">Name</Label>
              <Input
                id="property-name"
                name="propertyName"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="e.g. status…"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="property-type">Type</Label>
              <Select
                value={newType}
                onValueChange={(value) => {
                  setNewType(value as (typeof PROPERTY_TYPES)[number]);
                  if (value !== 'relation') setNewRelationTarget('');
                }}
              >
                <SelectTrigger id="property-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROPERTY_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type === 'enum'
                        ? 'choice'
                        : type === 'prose'
                          ? 'long text'
                          : type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newType === 'enum' ? (
              <div className="space-y-1.5">
                <Label htmlFor="property-choices">Choices</Label>
                <Input
                  id="property-choices"
                  name="propertyChoices"
                  value={newEnumValues}
                  onChange={(event) => setNewEnumValues(event.target.value)}
                  placeholder="e.g. open, won, lost…"
                  autoComplete="off"
                />
              </div>
            ) : null}
            {newType === 'relation' ? (
              <div className="space-y-1.5">
                <Label htmlFor="property-relation">Related database</Label>
                <Select
                  value={newRelationTarget}
                  onValueChange={setNewRelationTarget}
                >
                  <SelectTrigger id="property-relation" className="w-full">
                    <SelectValue placeholder="Select database…" />
                  </SelectTrigger>
                  <SelectContent>
                    {databases.map((database) => (
                      <SelectItem key={database.name} value={database.name}>
                        {database.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <Button
              size="sm"
              disabled={
                busy ||
                !newName.trim() ||
                (newType === 'enum' && !newEnumValues.trim()) ||
                (newType === 'relation' && !newRelationTarget)
              }
              onClick={() => void addProperty()}
            >
              Add property
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
