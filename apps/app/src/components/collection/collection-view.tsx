'use client';

import type {
  CollectionViewConfig,
  CollectionView as CollectionViewRecord,
  CollectionViewType,
  JsonValue,
} from '@kitsuneos/core';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Kanban,
  LayoutGrid,
  List,
  Plus,
  Search,
  SlidersHorizontal,
  Table as TableIcon,
  Trash2,
} from 'lucide-react';
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
  DropdownMenuItem,
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
import {
  addMonths,
  dayKey,
  monthGridDays,
  monthLabel,
  parseDateFieldValue,
  startOfMonth,
} from '@/lib/calendar-grid';
import { pageHref, pickBodyField } from '@/lib/page';
import {
  isPublishableCollection,
  normalizePublishStatus,
  PUBLISH_STATUSES,
  type PublishStatus,
  pickStatusField,
  publishStatusLabel,
} from '@/lib/publish-status';
import { recordLabel } from '@/lib/record-label';

interface SchemaCollection {
  name: string;
  capability?: string;
  fields: FieldMeta[];
  views?: CollectionViewRecord[];
}

const VIEW_TYPE_META: Record<
  CollectionViewType,
  { label: string; icon: typeof TableIcon }
> = {
  table: { label: 'Table', icon: TableIcon },
  board: { label: 'Board', icon: Kanban },
  list: { label: 'List', icon: List },
  gallery: { label: 'Gallery', icon: LayoutGrid },
  calendar: { label: 'Calendar', icon: CalendarDays },
};

const ADDABLE_VIEW_TYPES: CollectionViewType[] = [
  'board',
  'list',
  'gallery',
  'calendar',
];

/** Local, non-persisted quick text filter (separate from server-persisted view config). */
interface LocalFilterState {
  search: string;
}

function storageKey(scope: string, collection: string): string {
  return `kitsune:view:${scope}:${collection}`;
}

function loadLocalFilter(scope: string, collection: string): LocalFilterState {
  if (typeof window === 'undefined') return { search: '' };
  try {
    const raw = window.localStorage.getItem(storageKey(scope, collection));
    if (!raw) return { search: '' };
    const parsed = JSON.parse(raw) as { search?: string };
    return { search: parsed.search ?? '' };
  } catch {
    return { search: '' };
  }
}

function saveLocalFilter(
  scope: string,
  collection: string,
  state: LocalFilterState,
): void {
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

function sortViews(views: CollectionViewRecord[]): CollectionViewRecord[] {
  return [...views].sort((a, b) => a.position - b.position);
}

function StatusChip({ value }: { value: JsonValue | undefined }) {
  const status = normalizePublishStatus(cellText(value));
  if (!status) return null;
  return (
    <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {publishStatusLabel(status)}
    </span>
  );
}

export function CollectionView({ collection }: { collection: string }) {
  const router = useRouter();
  const [fields, setFields] = useState<FieldMeta[]>([]);
  const [capability, setCapability] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [rows, setRows] = useState<Array<Record<string, JsonValue>>>([]);
  const [relationOptions, setRelationOptions] = useState<
    Record<string, RelationOption[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewScope, setViewScope] = useState('anon');
  const [localFilter, setLocalFilter] = useState<LocalFilterState>({
    search: '',
  });
  const [views, setViews] = useState<CollectionViewRecord[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<PublishStatus | 'all'>(
    'all',
  );
  const [calendarMonth, setCalendarMonth] = useState(() =>
    startOfMonth(new Date()),
  );
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
          setLocalFilter(loadLocalFilter(scope, target));
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
      setCapability(meta.capability ?? '');
      const loadedViews = sortViews(meta.views ?? []);
      setViews(loadedViews);
      setActiveViewId((prev) => {
        if (prev && loadedViews.some((v) => v.id === prev)) return prev;
        const table = loadedViews.find((v) => v.isDefaultTable);
        return table?.id ?? loadedViews[0]?.id ?? null;
      });

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
      const loaded = queryBody.rows ?? [];
      setRows(loaded);
      setTruncated(loaded.length >= 100);
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
    setStatusFilter('all');
    setViews([]);
    setActiveViewId(null);
    void reload();
  }, [reload]);

  const canDirectEdit = fields.some((field) => field.writable);
  const statusField = useMemo(() => pickStatusField(fields), [fields]);
  const publishable = useMemo(() => isPublishableCollection(fields), [fields]);
  const bodyField = useMemo(() => pickBodyField(fields), [fields]);

  const activeView = useMemo(
    () => views.find((v) => v.id === activeViewId) ?? null,
    [views, activeViewId],
  );
  const viewConfig = activeView?.config ?? {};
  const hiddenColumns = viewConfig.hiddenColumns ?? [];

  const visibleFields = useMemo(
    () => fields.filter((f) => !hiddenColumns.includes(f.name)),
    [fields, hiddenColumns],
  );

  const filteredRows = useMemo(() => {
    let next = rows;
    if (publishable && statusField && statusFilter !== 'all') {
      next = next.filter(
        (row) =>
          normalizePublishStatus(cellText(row[statusField.name])) ===
          statusFilter,
      );
    }
    const q = localFilter.search.trim().toLowerCase();
    if (!q) return next;
    return next.filter((row) =>
      fields.some((field) => {
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
  }, [
    rows,
    localFilter.search,
    fields,
    relationOptions,
    publishable,
    statusField,
    statusFilter,
  ]);

  function updateLocalFilter(next: LocalFilterState) {
    setLocalFilter(next);
    saveLocalFilter(viewScope, collection, next);
  }

  const patchView = useCallback(
    async (viewId: string, patch: Record<string, unknown>) => {
      const res = await fetch(`/api/views/${viewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const body = (await res.json()) as {
        view?: CollectionViewRecord;
        error?: string;
      };
      if (!res.ok || !body.view) {
        throw new Error(body.error ?? 'Failed to update view');
      }
      return body.view;
    },
    [],
  );

  const updateActiveViewConfig = useCallback(
    (configPatch: Partial<CollectionViewConfig>) => {
      const view = activeView;
      if (!view) return;
      const nextConfig: CollectionViewConfig = {
        ...view.config,
        ...configPatch,
      };
      setViews((prev) =>
        prev.map((v) => (v.id === view.id ? { ...v, config: nextConfig } : v)),
      );
      void patchView(view.id, { config: nextConfig }).catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
    },
    [activeView, patchView],
  );

  async function addView(type: CollectionViewType) {
    setError('');
    try {
      const res = await fetch('/api/views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection,
          type,
          name: VIEW_TYPE_META[type].label,
        }),
      });
      const body = (await res.json()) as {
        view?: CollectionViewRecord;
        error?: string;
      };
      const createdView = body.view;
      if (!res.ok || !createdView) {
        throw new Error(body.error ?? 'Failed to create view');
      }
      setViews((prev) => sortViews([...prev, createdView]));
      setActiveViewId(createdView.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function removeActiveView() {
    const view = activeView;
    if (!view || view.isDefaultTable) return;
    const ok = window.confirm(`Delete the "${view.name}" view?`);
    if (!ok) return;
    try {
      const res = await fetch(`/api/views/${view.id}`, { method: 'DELETE' });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Failed to delete view');
      setViews((prev) => {
        const next = prev.filter((v) => v.id !== view.id);
        const table = next.find((v) => v.isDefaultTable);
        setActiveViewId(table?.id ?? next[0]?.id ?? null);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
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
    if (statusField) {
      next[statusField.name] = 'draft';
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

  /** Update a field via propose→approve→apply (used by board drag-and-drop). */
  const moveRow = useCallback(
    async (recordId: string, fieldName: string, value: JsonValue) => {
      const previous = rows;
      setRows((prev) =>
        prev.map((row) =>
          row.id === recordId ? { ...row, [fieldName]: value } : row,
        ),
      );
      try {
        const res = await fetch(`/api/records/${collection}/${recordId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { [fieldName]: value } }),
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(body.error ?? 'Update failed');
      } catch (err) {
        setRows(previous);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [collection, rows],
  );

  const activeType = activeView?.type ?? 'table';

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-4">
        <div className="mr-auto">
          <h1 className="text-xl font-semibold tracking-tight">{collection}</h1>
          <p className="text-xs text-muted-foreground">
            Database · {views.length} view{views.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
          <Input
            className="h-8 w-48 pl-8"
            placeholder="Filter loaded pages"
            value={localFilter.search}
            onChange={(event) =>
              updateLocalFilter({ ...localFilter, search: event.target.value })
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
              const checked = !hiddenColumns.includes(field.name);
              return (
                <DropdownMenuCheckboxItem
                  key={field.name}
                  checked={checked}
                  onCheckedChange={(value) => {
                    const hidden = new Set(hiddenColumns);
                    if (value) hidden.delete(field.name);
                    else hidden.add(field.name);
                    updateActiveViewConfig({ hiddenColumns: [...hidden] });
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
        <Button size="sm" disabled={!canDirectEdit} onClick={openCreate}>
          <Plus />
          New page
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-border px-6 py-1.5">
        {views.map((view) => {
          const meta = VIEW_TYPE_META[view.type];
          const Icon = meta.icon;
          const active = view.id === activeViewId;
          return (
            <button
              key={view.id}
              type="button"
              onClick={() => setActiveViewId(view.id)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                active
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
            >
              <Icon className="size-3.5" />
              {view.name}
            </button>
          );
        })}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-2">
              <Plus className="size-3.5" />
              View
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Add view</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ADDABLE_VIEW_TYPES.map((type) => {
              const meta = VIEW_TYPE_META[type];
              const Icon = meta.icon;
              return (
                <DropdownMenuItem key={type} onClick={() => void addView(type)}>
                  <Icon className="size-3.5" />
                  {meta.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        {activeView && !activeView.isDefaultTable ? (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-8 px-2 text-muted-foreground hover:text-destructive"
            onClick={() => void removeActiveView()}
          >
            <Trash2 className="size-3.5" />
            Delete view
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="border-b border-border px-6 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {publishable ? (
        <div className="flex flex-wrap gap-2 border-b border-border px-6 py-2">
          {(
            [
              { id: 'all' as const, label: 'All' },
              ...PUBLISH_STATUSES.map((status) => ({
                id: status,
                label: publishStatusLabel(status),
              })),
            ] as const
          ).map((chip) => {
            const active = statusFilter === chip.id;
            return (
              <Button
                key={chip.id}
                type="button"
                size="sm"
                variant={active ? 'default' : 'outline'}
                onClick={() => setStatusFilter(chip.id)}
              >
                {chip.label}
              </Button>
            );
          })}
        </div>
      ) : null}

      {truncated ? (
        <p className="border-b border-border px-6 py-2 text-sm text-muted-foreground">
          Showing the first 100 pages. Narrow with search, or open a page from
          Inbox / related links if you need something outside this list.
        </p>
      ) : null}
      {!canDirectEdit ? (
        <p className="border-b border-border px-6 py-2 text-sm text-muted-foreground">
          {capability === 'propose'
            ? 'Your access can suggest changes (via AI / Inbox) but not edit pages directly here.'
            : 'Your access to this database is view-only.'}
        </p>
      ) : null}

      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : activeType === 'board' ? (
          <BoardView
            fields={fields}
            rows={filteredRows}
            groupBy={viewConfig.groupBy}
            canDirectEdit={canDirectEdit}
            publishable={publishable}
            statusField={statusField}
            onSelectGroupBy={(name) =>
              updateActiveViewConfig({ groupBy: name })
            }
            onOpenRow={openRow}
            onMoveRow={moveRow}
          />
        ) : activeType === 'list' ? (
          <ListView
            rows={filteredRows}
            publishable={publishable}
            statusField={statusField}
            onOpenRow={openRow}
            emptyState={rows.length === 0}
            canDirectEdit={canDirectEdit}
            onCreate={openCreate}
          />
        ) : activeType === 'gallery' ? (
          <GalleryView
            rows={filteredRows}
            bodyField={bodyField}
            publishable={publishable}
            statusField={statusField}
            onOpenRow={openRow}
            emptyState={rows.length === 0}
            canDirectEdit={canDirectEdit}
            onCreate={openCreate}
          />
        ) : activeType === 'calendar' ? (
          <CalendarView
            fields={fields}
            rows={filteredRows}
            dateField={viewConfig.dateField}
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            onSelectDateField={(name) =>
              updateActiveViewConfig({ dateField: name })
            }
            onOpenRow={openRow}
          />
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
                        <Button
                          size="sm"
                          disabled={!canDirectEdit}
                          onClick={openCreate}
                        >
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

/** Board: group by any enum field. Cards drag between columns; drop PATCHes the field. */
function BoardView({
  fields,
  rows,
  groupBy,
  canDirectEdit,
  publishable,
  statusField,
  onSelectGroupBy,
  onOpenRow,
  onMoveRow,
}: {
  fields: FieldMeta[];
  rows: Array<Record<string, JsonValue>>;
  groupBy: string | undefined;
  canDirectEdit: boolean;
  publishable: boolean;
  statusField: FieldMeta | undefined;
  onSelectGroupBy: (name: string) => void;
  onOpenRow: (row: Record<string, JsonValue>) => void;
  onMoveRow: (recordId: string, fieldName: string, value: JsonValue) => void;
}) {
  const enumFields = useMemo(
    () => fields.filter((f) => f.type === 'enum'),
    [fields],
  );
  const groupField = enumFields.find((f) => f.name === groupBy);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  if (!groupField) {
    if (enumFields.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">
          Board view groups pages by a choice property. Add a choice property in
          Properties to use Board.
        </p>
      );
    }
    return (
      <div className="max-w-sm space-y-2">
        <Label>Group by</Label>
        <Select onValueChange={onSelectGroupBy}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose a choice property…" />
          </SelectTrigger>
          <SelectContent>
            {enumFields.map((field) => (
              <SelectItem key={field.name} value={field.name}>
                {field.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  const NO_VALUE = '__none__';
  const columns = [...(groupField.enumValues ?? []), NO_VALUE];
  const fieldName = groupField.name;

  return (
    <div className="flex h-full gap-4 overflow-x-auto pb-2">
      {columns.map((columnValue) => {
        const label = columnValue === NO_VALUE ? 'No value' : columnValue;
        const cards = rows.filter((row) => {
          const value = cellText(row[fieldName]);
          return columnValue === NO_VALUE ? !value : value === columnValue;
        });
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: drop zone for HTML5 drag-and-drop; cards inside are keyboard-focusable buttons.
          <div
            key={columnValue}
            className={`flex w-64 shrink-0 flex-col rounded-md border border-border bg-muted/30 ${
              dragOverColumn === columnValue ? 'ring-2 ring-primary' : ''
            }`}
            onDragOver={(event) => {
              if (!canDirectEdit) return;
              event.preventDefault();
              setDragOverColumn(columnValue);
            }}
            onDragLeave={() => setDragOverColumn(null)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOverColumn(null);
              if (!canDirectEdit) return;
              const recordId = event.dataTransfer.getData('text/plain');
              if (!recordId) return;
              onMoveRow(
                recordId,
                fieldName,
                columnValue === NO_VALUE ? null : columnValue,
              );
            }}
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-medium text-foreground">
                {label}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {cards.length}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
              {cards.map((row) => (
                <button
                  key={String(row.id ?? JSON.stringify(row))}
                  type="button"
                  draggable={canDirectEdit}
                  onDragStart={(event) => {
                    if (typeof row.id !== 'string') return;
                    event.dataTransfer.setData('text/plain', row.id);
                  }}
                  onClick={() => onOpenRow(row)}
                  className="cursor-pointer rounded-md border border-border bg-background p-2.5 text-left text-sm shadow-xs hover:border-primary/50"
                >
                  <p className="truncate font-medium">{recordLabel(row)}</p>
                  {publishable && statusField ? (
                    <div className="mt-1.5">
                      <StatusChip value={row[statusField.name]} />
                    </div>
                  ) : null}
                </button>
              ))}
              {cards.length === 0 ? (
                <p className="px-1 py-2 text-center text-[11px] text-muted-foreground">
                  No pages
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** List: compact single-line rows. */
function ListView({
  rows,
  publishable,
  statusField,
  onOpenRow,
  emptyState,
  canDirectEdit,
  onCreate,
}: {
  rows: Array<Record<string, JsonValue>>;
  publishable: boolean;
  statusField: FieldMeta | undefined;
  onOpenRow: (row: Record<string, JsonValue>) => void;
  emptyState: boolean;
  canDirectEdit: boolean;
  onCreate: () => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        emptyState={emptyState}
        canDirectEdit={canDirectEdit}
        onCreate={onCreate}
      />
    );
  }
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {rows.map((row) => (
        <li key={String(row.id ?? JSON.stringify(row))}>
          <button
            type="button"
            onClick={() => onOpenRow(row)}
            className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/40"
          >
            <span className="flex-1 truncate font-medium">
              {recordLabel(row)}
            </span>
            {publishable && statusField ? (
              <StatusChip value={row[statusField.name]} />
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Gallery: card grid with title + prose snippet. */
function GalleryView({
  rows,
  bodyField,
  publishable,
  statusField,
  onOpenRow,
  emptyState,
  canDirectEdit,
  onCreate,
}: {
  rows: Array<Record<string, JsonValue>>;
  bodyField: FieldMeta | undefined;
  publishable: boolean;
  statusField: FieldMeta | undefined;
  onOpenRow: (row: Record<string, JsonValue>) => void;
  emptyState: boolean;
  canDirectEdit: boolean;
  onCreate: () => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        emptyState={emptyState}
        canDirectEdit={canDirectEdit}
        onCreate={onCreate}
      />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {rows.map((row) => (
        <button
          key={String(row.id ?? JSON.stringify(row))}
          type="button"
          onClick={() => onOpenRow(row)}
          className="flex flex-col rounded-md border border-border bg-background p-3 text-left shadow-xs hover:border-primary/50"
        >
          <p className="truncate text-sm font-medium">{recordLabel(row)}</p>
          {bodyField ? (
            <p className="mt-1.5 line-clamp-3 text-xs text-muted-foreground">
              {cellText(row[bodyField.name]) || 'No content yet'}
            </p>
          ) : null}
          {publishable && statusField ? (
            <div className="mt-2">
              <StatusChip value={row[statusField.name]} />
            </div>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** Calendar: month grid keyed off a required date/timestamp field. */
function CalendarView({
  fields,
  rows,
  dateField,
  month,
  onMonthChange,
  onSelectDateField,
  onOpenRow,
}: {
  fields: FieldMeta[];
  rows: Array<Record<string, JsonValue>>;
  dateField: string | undefined;
  month: Date;
  onMonthChange: (next: Date) => void;
  onSelectDateField: (name: string) => void;
  onOpenRow: (row: Record<string, JsonValue>) => void;
}) {
  const dateFields = useMemo(
    () => fields.filter((f) => f.type === 'timestamp'),
    [fields],
  );
  const field = dateFields.find((f) => f.name === dateField);

  if (!field) {
    if (dateFields.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">
          Calendar view needs a date/timestamp property. Add one in Properties
          to use Calendar.
        </p>
      );
    }
    return (
      <div className="max-w-sm space-y-2">
        <Label>Date property</Label>
        <Select onValueChange={onSelectDateField}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose a date property…" />
          </SelectTrigger>
          <SelectContent>
            {dateFields.map((f) => (
              <SelectItem key={f.name} value={f.name}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  const byDay = new Map<string, Array<Record<string, JsonValue>>>();
  const undated: Array<Record<string, JsonValue>> = [];
  for (const row of rows) {
    const parsed = parseDateFieldValue(row[field.name]);
    if (!parsed) {
      undated.push(row);
      continue;
    }
    const key = dayKey(parsed);
    const bucket = byDay.get(key) ?? [];
    bucket.push(row);
    byDay.set(key, bucket);
  }

  const days = monthGridDays(month);
  const todayKey = dayKey(new Date());

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onMonthChange(addMonths(month, -1))}
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        <p className="text-sm font-medium">{monthLabel(month)}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onMonthChange(addMonths(month, 1))}
        >
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-border bg-border text-xs">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
          <div
            key={label}
            className="bg-muted px-2 py-1 text-center font-medium text-muted-foreground"
          >
            {label}
          </div>
        ))}
        {days.map((day) => {
          const key = dayKey(day);
          const inMonth = day.getMonth() === month.getMonth();
          const cards = byDay.get(key) ?? [];
          return (
            <div
              key={key}
              className={`min-h-24 bg-background p-1.5 ${
                inMonth ? '' : 'bg-muted/30 text-muted-foreground'
              } ${key === todayKey ? 'ring-1 ring-inset ring-primary' : ''}`}
            >
              <p className="mb-1 text-[11px] font-medium">{day.getDate()}</p>
              <div className="space-y-1">
                {cards.slice(0, 3).map((row) => (
                  <button
                    key={String(row.id ?? JSON.stringify(row))}
                    type="button"
                    onClick={() => onOpenRow(row)}
                    className="block w-full truncate rounded bg-accent px-1 py-0.5 text-left text-[11px] text-accent-foreground hover:opacity-80"
                  >
                    {recordLabel(row)}
                  </button>
                ))}
                {cards.length > 3 ? (
                  <p className="text-[10px] text-muted-foreground">
                    +{cards.length - 3} more
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {undated.length > 0 ? (
        <div className="rounded-md border border-border p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Undated ({undated.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {undated.map((row) => (
              <button
                key={String(row.id ?? JSON.stringify(row))}
                type="button"
                onClick={() => onOpenRow(row)}
                className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted/60"
              >
                {recordLabel(row)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({
  emptyState,
  canDirectEdit,
  onCreate,
}: {
  emptyState: boolean;
  canDirectEdit: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-border">
      {emptyState ? (
        <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-2">
          <div className="space-y-1 text-center">
            <p className="text-sm font-medium text-foreground">
              Add your first page
            </p>
            <p className="text-xs text-muted-foreground">
              A page is one row in this database.
            </p>
          </div>
          <Button size="sm" disabled={!canDirectEdit} onClick={onCreate}>
            <Plus />
            Create first page
          </Button>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">No matching pages</span>
      )}
    </div>
  );
}
