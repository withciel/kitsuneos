'use client';

import type { JsonValue } from '@kitsuneos/core';
import { Columns3, Plus, Search, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DatabasePropertiesSheet } from '@/components/collection/database-properties-sheet';
import {
  cellText,
  draftToPayload,
  FieldControl,
  type FieldMeta,
  type RelationOption,
} from '@/components/page/field-control';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { pageHref } from '@/lib/page';
import { recordLabel } from '@/lib/record-label';

interface SchemaCollection {
  name: string;
  fields: FieldMeta[];
}

interface ViewState {
  hiddenColumns: string[];
  search: string;
}

function storageKey(scope: string, collection: string): string {
  return `kitsune:view:${scope}:${collection}`;
}

function loadView(scope: string, collection: string): ViewState {
  if (typeof window === 'undefined') {
    return { hiddenColumns: [], search: '' };
  }
  try {
    const raw = window.localStorage.getItem(storageKey(scope, collection));
    if (!raw) return { hiddenColumns: [], search: '' };
    return JSON.parse(raw) as ViewState;
  } catch {
    return { hiddenColumns: [], search: '' };
  }
}

function saveView(scope: string, collection: string, state: ViewState): void {
  window.localStorage.setItem(
    storageKey(scope, collection),
    JSON.stringify(state),
  );
}

async function loadRelationOptions(
  collections: SchemaCollection[],
): Promise<Record<string, RelationOption[]>> {
  const targets = new Set<string>();
  for (const collection of collections) {
    for (const field of collection.fields) {
      if (field.type === 'relation' && field.relationTarget) {
        targets.add(field.relationTarget);
      }
    }
  }

  const options: Record<string, RelationOption[]> = {};
  await Promise.all(
    [...targets].map(async (target) => {
      const meta = collections.find((item) => item.name === target);
      const fields = meta?.fields.map((field) => field.name) ?? ['id'];
      const queryRes = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection: target,
          fields,
          limit: 100,
        }),
      });
      const queryBody = (await queryRes.json()) as {
        rows?: Array<Record<string, JsonValue>>;
        error?: string;
      };
      if (!queryRes.ok) {
        throw new Error(
          queryBody.error ?? `Failed to load related ${target} pages`,
        );
      }
      options[target] = (queryBody.rows ?? [])
        .filter((row): row is Record<string, JsonValue> & { id: string } => {
          return typeof row.id === 'string' && row.id.length > 0;
        })
        .map((row) => ({ id: row.id, label: recordLabel(row) }));
    }),
  );
  return options;
}

function relationLabel(
  field: FieldMeta,
  value: JsonValue | undefined,
  options: Record<string, RelationOption[]>,
): string {
  const id = cellText(value);
  if (!id) return '';
  const target = field.relationTarget;
  const match = target
    ? options[target]?.find((option) => option.id === id)
    : undefined;
  return match?.label ?? id.slice(0, 8);
}

export function CollectionView({ collection }: { collection: string }) {
  const router = useRouter();
  const [fields, setFields] = useState<FieldMeta[]>([]);
  const [rows, setRows] = useState<Array<Record<string, JsonValue>>>([]);
  const [relationOptions, setRelationOptions] = useState<
    Record<string, RelationOption[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewScope, setViewScope] = useState('anon');
  const [view, setView] = useState<ViewState>({
    hiddenColumns: [],
    search: '',
  });
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const collectionRef = useRef(collection);
  collectionRef.current = collection;

  const reload = useCallback(async () => {
    const target = collection;
    setLoading(true);
    setError('');
    try {
      const meRes = await fetch('/api/me');
      if (meRes.ok) {
        const me = (await meRes.json()) as {
          userId?: string;
          workspaceId?: string;
        };
        const scope = me.userId ?? me.workspaceId ?? 'anon';
        if (collectionRef.current === target) {
          setViewScope(scope);
          setView(loadView(scope, target));
        }
      }

      const schemaRes = await fetch('/api/schema');
      const schemaBody = (await schemaRes.json()) as {
        collections?: SchemaCollection[];
        error?: string;
      };
      if (!schemaRes.ok) {
        throw new Error(schemaBody.error ?? 'Failed to load schema');
      }
      if (collectionRef.current !== target) return;
      const meta = schemaBody.collections?.find((c) => c.name === target);
      if (!meta) {
        throw new Error(`Database not found: ${target}`);
      }
      setFields(meta.fields);

      const fieldNames = meta.fields.map((f) => f.name);
      const queryRes = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection: target,
          fields: fieldNames,
          limit: 100,
        }),
      });
      const queryBody = (await queryRes.json()) as {
        rows?: Array<Record<string, JsonValue>>;
        error?: string;
      };
      if (!queryRes.ok) {
        throw new Error(queryBody.error ?? 'Query failed');
      }
      if (collectionRef.current !== target) return;
      setRows(queryBody.rows ?? []);
      setRelationOptions(
        await loadRelationOptions(schemaBody.collections ?? []),
      );
    } catch (err) {
      if (collectionRef.current !== target) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (collectionRef.current === target) setLoading(false);
    }
  }, [collection]);

  useEffect(() => {
    setCreating(false);
    setRows([]);
    setFields([]);
    setRelationOptions({});
    void reload();
  }, [reload]);

  const visibleFields = useMemo(
    () => fields.filter((f) => !view.hiddenColumns.includes(f.name)),
    [fields, view.hiddenColumns],
  );

  const filteredRows = useMemo(() => {
    const q = view.search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      visibleFields.some((field) => {
        const raw = cellText(row[field.name]).toLowerCase();
        const label =
          field.type === 'relation'
            ? relationLabel(
                field,
                row[field.name],
                relationOptions,
              ).toLowerCase()
            : '';
        return raw.includes(q) || label.includes(q);
      }),
    );
  }, [rows, view.search, visibleFields, relationOptions]);

  function updateView(next: ViewState) {
    setView(next);
    saveView(viewScope, collection, next);
  }

  function openRow(row: Record<string, JsonValue>) {
    if (typeof row.id !== 'string') return;
    router.push(pageHref(row.id, collection));
  }

  function openCreate() {
    setCreating(true);
    const next: Record<string, string> = {};
    for (const field of fields) {
      next[field.name] = '';
    }
    setDraft(next);
  }

  function setDraftField(name: string, value: string) {
    setDraft((prev) => ({ ...prev, [name]: value }));
  }

  async function saveNewPage() {
    setSaving(true);
    setError('');
    try {
      const payload = draftToPayload(fields, draft);
      const res = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection, record: payload }),
      });
      const body = (await res.json()) as { recordId?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Create failed');
      if (typeof body.recordId !== 'string') {
        throw new Error('Create succeeded without page id');
      }
      setCreating(false);
      router.push(pageHref(body.recordId, collection));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-4">
        <div className="mr-auto">
          <h1 className="text-xl font-semibold tracking-tight">{collection}</h1>
          <p className="text-xs text-muted-foreground">
            Database · table of pages
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
          <Input
            className="h-8 w-48 pl-8"
            placeholder="Filter loaded pages"
            value={view.search}
            onChange={(event) =>
              updateView({ ...view, search: event.target.value })
            }
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3 />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {fields.map((field) => {
              const checked = !view.hiddenColumns.includes(field.name);
              return (
                <DropdownMenuCheckboxItem
                  key={field.name}
                  checked={checked}
                  onCheckedChange={(value) => {
                    const hidden = new Set(view.hiddenColumns);
                    if (value) hidden.delete(field.name);
                    else hidden.add(field.name);
                    updateView({
                      ...view,
                      hiddenColumns: [...hidden],
                    });
                  }}
                >
                  {field.name}
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPropertiesOpen(true)}
        >
          <SlidersHorizontal />
          Properties
        </Button>
        <Button size="sm" onClick={openCreate}>
          <Plus />
          New page
        </Button>
      </div>

      {error ? (
        <p className="border-b border-border px-6 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {visibleFields.map((field) => (
                  <TableHead key={field.name}>
                    {field.name}
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      {field.type}
                      {field.type === 'relation' && field.relationTarget
                        ? ` → ${field.relationTarget}`
                        : ''}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={Math.max(visibleFields.length, 1)}
                    className="h-32 text-center"
                  >
                    {rows.length === 0 ? (
                      <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-2">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">
                            Add your first page
                          </p>
                          <p className="text-xs text-muted-foreground">
                            A page is one row in this database — your first
                            human write. After that, connect an AI helper so it
                            can propose updates here.
                          </p>
                        </div>
                        <Button size="sm" onClick={openCreate}>
                          <Plus />
                          Create first page
                        </Button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">
                        No matching pages
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((row) => (
                  <TableRow
                    key={String(row.id ?? JSON.stringify(row))}
                    className="cursor-pointer"
                    onClick={() => openRow(row)}
                  >
                    {visibleFields.map((field) => (
                      <TableCell key={field.name} className="max-w-64 truncate">
                        {field.type === 'relation' && field.relationTarget ? (
                          cellText(row[field.name]) ? (
                            <Link
                              href={pageHref(
                                cellText(row[field.name]),
                                field.relationTarget,
                              )}
                              className="text-primary underline-offset-4 hover:underline"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {relationLabel(
                                field,
                                row[field.name],
                                relationOptions,
                              )}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )
                        ) : (
                          cellText(row[field.name])
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <Sheet
        open={creating}
        onOpenChange={(open) => {
          if (!open) setCreating(false);
        }}
      >
        <SheetContent className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>New page</SheetTitle>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
            {fields.map((field) => (
              <div key={field.name} className="space-y-1.5">
                <Label htmlFor={`field-${field.name}`}>
                  {field.name}
                  <span className="ml-1 text-muted-foreground">
                    ({field.type}
                    {field.type === 'relation' && field.relationTarget
                      ? ` → ${field.relationTarget}`
                      : ''}
                    )
                  </span>
                </Label>
                <FieldControl
                  field={field}
                  value={draft[field.name] ?? ''}
                  options={
                    field.relationTarget
                      ? (relationOptions[field.relationTarget] ?? [])
                      : []
                  }
                  onChange={(value) => setDraftField(field.name, value)}
                />
              </div>
            ))}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveNewPage()} disabled={saving}>
              {saving ? 'Creating…' : 'Create'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <DatabasePropertiesSheet
        collection={collection}
        open={propertiesOpen}
        onOpenChange={setPropertiesOpen}
        onChanged={() => {
          void reload();
        }}
      />
    </div>
  );
}
