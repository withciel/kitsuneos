'use client';

import { useCallback, useEffect, useState } from 'react';
import { SettingsNav } from '@/components/settings/settings-nav';
import { Badge } from '@/components/ui/badge';
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
import { Skeleton } from '@/components/ui/skeleton';

interface FieldMeta {
  name: string;
  type: string;
  writable: boolean;
}

interface CollectionMeta {
  name: string;
  capability: string;
  fields: FieldMeta[];
}

const FIELD_TYPES = [
  'text',
  'number',
  'boolean',
  'enum',
  'relation',
  'prose',
] as const;

export default function SettingsSchemaPage() {
  const [collections, setCollections] = useState<CollectionMeta[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] =
    useState<(typeof FIELD_TYPES)[number]>('text');
  const [newEnumValues, setNewEnumValues] = useState('');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/schema');
      const body = (await response.json()) as {
        collections?: CollectionMeta[];
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? 'Failed to load schema');
      setCollections(body.collections ?? []);
      setSelected((prev) => prev || body.collections?.[0]?.name || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const current = collections.find((c) => c.name === selected);

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
    if (!response.ok) throw new Error(body.error ?? 'Schema mutation failed');
  }

  async function addField() {
    if (!selected || !newFieldName.trim()) return;
    const enumValues =
      newFieldType === 'enum'
        ? newEnumValues
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        : [];
    if (newFieldType === 'enum' && enumValues.length === 0) {
      setError('Enum fields require at least one value');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await mutateSchema({
        collection: selected,
        op: 'addField',
        field: {
          name: newFieldName.trim(),
          type: newFieldType,
          ...(newFieldType === 'enum' ? { enumValues } : {}),
        },
      });
      setNewFieldName('');
      setNewEnumValues('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function dropField(fieldName: string) {
    if (!selected) return;
    const ok = window.confirm(
      `Drop field "${fieldName}" from ${selected}? This cannot be undone.`,
    );
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      await mutateSchema({
        collection: selected,
        op: 'dropField',
        fieldName,
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function createCollection() {
    if (!newCollectionName.trim()) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCollectionName.trim(),
          fields: [{ name: 'name', type: 'text', nullable: false }],
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Create failed');
      setNewCollectionName('');
      setSelected(newCollectionName.trim());
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <SettingsNav />
      <div className="grid flex-1 gap-6 p-6 lg:grid-cols-[220px_1fr]">
        <aside className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            Collections
          </p>
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <ul className="space-y-1">
              {collections.map((collection) => (
                <li key={collection.name}>
                  <button
                    type="button"
                    className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${
                      selected === collection.name
                        ? 'bg-primary/15 text-primary'
                        : 'hover:bg-muted'
                    }`}
                    onClick={() => setSelected(collection.name)}
                  >
                    {collection.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-2 border-t border-border pt-3">
            <Label htmlFor="new-collection">New collection</Label>
            <Input
              id="new-collection"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              placeholder="name"
            />
            <Button
              size="sm"
              className="w-full"
              disabled={busy}
              onClick={() => void createCollection()}
            >
              Create
            </Button>
          </div>
        </aside>
        <section className="space-y-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {current ? (
            <>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-medium">{current.name}</h2>
                <Badge variant="secondary">{current.capability}</Badge>
              </div>
              <ul className="divide-y divide-border rounded-md border border-border">
                {current.fields.map((field) => (
                  <li
                    key={field.name}
                    className="flex items-center justify-between px-3 py-2 text-sm"
                  >
                    <span>
                      <span className="font-medium">{field.name}</span>
                      <span className="ml-2 text-muted-foreground">
                        {field.type}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void dropField(field.name)}
                    >
                      Drop
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-end gap-2 rounded-md border border-border p-3">
                <div className="space-y-1">
                  <Label htmlFor="field-name">Add field</Label>
                  <Input
                    id="field-name"
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    placeholder="field_name"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select
                    value={newFieldType}
                    onValueChange={(value) =>
                      setNewFieldType(value as (typeof FIELD_TYPES)[number])
                    }
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {newFieldType === 'enum' ? (
                  <div className="space-y-1">
                    <Label htmlFor="enum-values">Enum values</Label>
                    <Input
                      id="enum-values"
                      value={newEnumValues}
                      onChange={(e) => setNewEnumValues(e.target.value)}
                      placeholder="open, won, lost"
                    />
                  </div>
                ) : null}
                <Button
                  size="sm"
                  disabled={
                    busy || (newFieldType === 'enum' && !newEnumValues.trim())
                  }
                  onClick={() => void addField()}
                >
                  Add field
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a collection to edit its schema.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
