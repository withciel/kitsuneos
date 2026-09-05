'use client';

import type { JsonValue } from '@kitsuneos/core';
import { Columns3, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Textarea } from '@/components/ui/textarea';
import { recordLabel } from '@/lib/record-label';

const NONE_VALUE = '__none__';

interface FieldMeta {
  name: string;
  type: string;
  writable: boolean;
  relationTarget?: string | null;
}

interface SchemaCollection {
  name: string;
  fields: FieldMeta[];
}

interface RelationOption {
  id: string;
  label: string;
}

interface RelatedNeighbor {
  field: string;
  collection: string;
  recordId: string;
  label: string | null;
}

interface RelatedResult {
  outgoing: RelatedNeighbor[];
  incoming: RelatedNeighbor[];
}

interface RevisionSummary {
  revision: number;
  changedFields: string[];
  principalId: string;
  changeSetId: string | null;
  validFrom: string;
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

function cellText(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function formatWhen(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Date(parsed).toLocaleString();
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
          queryBody.error ?? `Failed to load related ${target} records`,
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
  const [selected, setSelected] = useState<Record<string, JsonValue> | null>(
    null,
  );
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [related, setRelated] = useState<RelatedResult | null>(null);
  const [relatedLoading, setRelatedLoading] = useState(false);
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
        throw new Error(`Collection not found: ${target}`);
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
    setSelected(null);
    setCreating(false);
    setRows([]);
    setFields([]);
    setRelationOptions({});
    setRevisions([]);
    setRelated(null);
    void reload();
  }, [reload]);

  useEffect(() => {
    const recordId =
      !creating && typeof selected?.id === 'string' ? selected.id : '';
    if (!recordId) {
      setRevisions([]);
      setRevisionsLoading(false);
      setRelated(null);
      setRelatedLoading(false);
      return;
    }
    let cancelled = false;
    setRevisionsLoading(true);
    setRelatedLoading(true);
    void fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection,
        recordId,
        limit: 20,
      }),
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          revisions?: RevisionSummary[];
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok) {
          throw new Error(body.error ?? 'Failed to load history');
        }
        setRevisions(body.revisions ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setRevisions([]);
      })
      .finally(() => {
        if (!cancelled) setRevisionsLoading(false);
      });

    void fetch('/api/related', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection, recordId }),
    })
      .then(async (response) => {
        const body = (await response.json()) as RelatedResult & {
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok) {
          throw new Error(body.error ?? 'Failed to load related');
        }
        setRelated({
          outgoing: body.outgoing ?? [],
          incoming: body.incoming ?? [],
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setRelated(null);
      })
      .finally(() => {
        if (!cancelled) setRelatedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [collection, creating, selected?.id]);

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
    setCreating(false);
    setSelected(row);
    const next: Record<string, string> = {};
    for (const field of fields) {
      next[field.name] = cellText(row[field.name]);
    }
    setDraft(next);
  }

  function openCreate() {
    setCreating(true);
    setSelected({});
    const next: Record<string, string> = {};
    for (const field of fields) {
      next[field.name] = '';
    }
    setDraft(next);
  }

  function setDraftField(name: string, value: string) {
    setDraft((prev) => ({ ...prev, [name]: value }));
  }

  async function saveRecord() {
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, JsonValue> = {};
      for (const field of fields) {
        if (!field.writable) continue;
        const raw = draft[field.name] ?? '';
        if (field.type === 'number') {
          if (raw === '') {
            payload[field.name] = null;
          } else {
            const n = Number(raw);
            if (!Number.isFinite(n)) {
              throw new Error(`Invalid number for ${field.name}`);
            }
            payload[field.name] = n;
          }
        } else if (field.type === 'boolean') {
          payload[field.name] = raw === 'true';
        } else if (field.type === 'relation') {
          payload[field.name] = raw === '' || raw === NONE_VALUE ? null : raw;
        } else {
          payload[field.name] = raw;
        }
      }

      if (creating) {
        const res = await fetch('/api/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ collection, record: payload }),
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(body.error ?? 'Create failed');
      } else {
        const id = selected?.id;
        if (typeof id !== 'string') throw new Error('Missing record id');
        const res = await fetch(`/api/records/${collection}/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: payload }),
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(body.error ?? 'Update failed');
      }
      setSelected(null);
      setCreating(false);
      await reload();
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
          <p className="text-xs text-muted-foreground">Table view</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
          <Input
            className="h-8 w-48 pl-8"
            placeholder="Filter loaded rows"
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
        <Button size="sm" onClick={openCreate}>
          <Plus />
          New
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
                    className="h-24 text-center text-muted-foreground"
                  >
                    {rows.length === 0
                      ? 'No records yet. Create the first one.'
                      : 'No matching rows'}
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
                              href={`/c/${field.relationTarget}`}
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
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setCreating(false);
          }
        }}
      >
        <SheetContent className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{creating ? 'New record' : 'Record'}</SheetTitle>
            {!creating && typeof selected?.id === 'string' ? (
              <Badge
                variant="secondary"
                className="w-fit font-mono text-[10px]"
              >
                {selected.id}
              </Badge>
            ) : null}
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
            {!creating && typeof selected?.id === 'string' ? (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-xs font-medium text-muted-foreground uppercase">
                  Related
                </p>
                {relatedLoading ? (
                  <Skeleton className="h-12 w-full" />
                ) : !related ||
                  (related.outgoing.length === 0 &&
                    related.incoming.length === 0) ? (
                  <p className="text-xs text-muted-foreground">
                    No related records visible to you.
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {related.outgoing.map((neighbor) => (
                      <li key={`out-${neighbor.field}-${neighbor.recordId}`}>
                        <span className="text-muted-foreground">
                          {neighbor.field} →{' '}
                        </span>
                        <Link
                          href={`/c/${neighbor.collection}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {neighbor.label ?? neighbor.recordId.slice(0, 8)}
                        </Link>
                      </li>
                    ))}
                    {related.incoming.map((neighbor) => (
                      <li
                        key={`in-${neighbor.collection}-${neighbor.recordId}`}
                      >
                        <span className="text-muted-foreground">
                          ← {neighbor.collection}.{neighbor.field}{' '}
                        </span>
                        <Link
                          href={`/c/${neighbor.collection}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {neighbor.label ?? neighbor.recordId.slice(0, 8)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
            {!creating && typeof selected?.id === 'string' ? (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-xs font-medium text-muted-foreground uppercase">
                  History
                </p>
                {revisionsLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : revisions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No revisions yet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {revisions.map((revision) => (
                      <li
                        key={`${revision.revision}-${revision.validFrom}`}
                        className="rounded-md border border-border px-3 py-2 text-xs"
                      >
                        <p className="font-medium">
                          Revision {revision.revision}
                        </p>
                        <p className="text-muted-foreground">
                          {formatWhen(revision.validFrom)}
                          {revision.principalId
                            ? ` · ${revision.principalId}`
                            : ''}
                        </p>
                        {revision.changedFields.length > 0 ? (
                          <p className="mt-1 text-muted-foreground">
                            {revision.changedFields.join(', ')}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelected(null);
                setCreating(false);
              }}
            >
              Cancel
            </Button>
            <Button onClick={() => void saveRecord()} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FieldControl({
  field,
  value,
  options,
  onChange,
}: {
  field: FieldMeta;
  value: string;
  options: RelationOption[];
  onChange: (value: string) => void;
}) {
  if (field.type === 'prose') {
    return (
      <Textarea
        id={`field-${field.name}`}
        value={value}
        disabled={!field.writable}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  if (field.type === 'boolean') {
    return (
      <Select
        value={value === 'true' ? 'true' : 'false'}
        disabled={!field.writable}
        onValueChange={onChange}
      >
        <SelectTrigger id={`field-${field.name}`} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">true</SelectItem>
          <SelectItem value="false">false</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  if (field.type === 'relation') {
    return (
      <Select
        value={value || NONE_VALUE}
        disabled={!field.writable}
        onValueChange={(next) => onChange(next === NONE_VALUE ? '' : next)}
      >
        <SelectTrigger id={`field-${field.name}`} className="w-full">
          <SelectValue placeholder="Select related record" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>None</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      id={`field-${field.name}`}
      type={field.type === 'number' ? 'number' : 'text'}
      value={value}
      disabled={!field.writable}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
