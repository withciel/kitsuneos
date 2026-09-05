'use client';

import type { JsonValue } from '@kitsuneos/core';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  cellText,
  draftToPayload,
  FieldControl,
  type FieldMeta,
  type RelationOption,
} from '@/components/page/field-control';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { pageHref, pickBodyField, pickTitleField } from '@/lib/page';
import { recordLabel } from '@/lib/record-label';

interface SchemaCollection {
  name: string;
  fields: FieldMeta[];
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

export function PageView({
  pageId,
  collection,
}: {
  pageId: string;
  collection: string;
}) {
  const router = useRouter();
  const [fields, setFields] = useState<FieldMeta[]>([]);
  const [row, setRow] = useState<Record<string, JsonValue> | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [relationOptions, setRelationOptions] = useState<
    Record<string, RelationOption[]>
  >({});
  const [related, setRelated] = useState<RelatedResult | null>(null);
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  const titleField = useMemo(() => pickTitleField(fields), [fields]);
  const bodyField = useMemo(() => pickBodyField(fields), [fields]);
  const propertyFields = useMemo(
    () =>
      fields.filter(
        (field) =>
          field.name !== 'id' &&
          field.name !== titleField?.name &&
          field.name !== bodyField?.name,
      ),
    [fields, titleField, bodyField],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const schemaRes = await fetch('/api/schema');
      const schemaBody = (await schemaRes.json()) as {
        collections?: SchemaCollection[];
        error?: string;
      };
      if (!schemaRes.ok) {
        throw new Error(schemaBody.error ?? 'Failed to load schema');
      }
      const meta = schemaBody.collections?.find((c) => c.name === collection);
      if (!meta) {
        throw new Error(`Database not found: ${collection}`);
      }
      setFields(meta.fields);

      const getRes = await fetch(`/api/records/${collection}/${pageId}`);
      const getBody = (await getRes.json()) as Record<string, JsonValue> & {
        error?: string;
      };
      if (!getRes.ok) {
        throw new Error(
          typeof getBody.error === 'string' ? getBody.error : 'Page not found',
        );
      }
      setRow(getBody);
      const next: Record<string, string> = {};
      for (const field of meta.fields) {
        next[field.name] = cellText(getBody[field.name]);
      }
      setDraft(next);
      setDirty(false);
      setRelationOptions(
        await loadRelationOptions(schemaBody.collections ?? []),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [collection, pageId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    setRelatedLoading(true);
    setRevisionsLoading(true);
    void fetch('/api/related', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection, recordId: pageId }),
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

    void fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection, recordId: pageId, limit: 20 }),
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

    return () => {
      cancelled = true;
    };
  }, [collection, pageId]);

  function setDraftField(name: string, value: string) {
    setDraft((prev) => ({ ...prev, [name]: value }));
    setDirty(true);
  }

  async function savePage() {
    setSaving(true);
    setError('');
    try {
      const payload = draftToPayload(fields, draft);
      const res = await fetch(`/api/records/${collection}/${pageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: payload }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Update failed');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!row) {
    return (
      <div className="space-y-3 p-8">
        <p className="text-sm text-destructive">{error || 'Page not found'}</p>
        <Button
          variant="outline"
          onClick={() => router.push(`/c/${collection}`)}
        >
          Back to database
        </Button>
      </div>
    );
  }

  const heading =
    (titleField ? draft[titleField.name] : '')?.trim() ||
    recordLabel(row) ||
    'Untitled';

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border px-6 py-4">
        <p className="text-xs text-muted-foreground">
          <Link href={`/c/${collection}`} className="hover:text-foreground">
            {collection}
          </Link>
          {' / '}
          Page
        </p>
        <div className="mt-2 flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            {titleField ? (
              <input
                className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground"
                value={draft[titleField.name] ?? ''}
                disabled={!titleField.writable}
                placeholder="Untitled"
                onChange={(event) =>
                  setDraftField(titleField.name, event.target.value)
                }
              />
            ) : (
              <h1 className="text-2xl font-semibold tracking-tight">
                {heading}
              </h1>
            )}
            <Badge
              variant="secondary"
              className="mt-2 w-fit font-mono text-[10px]"
            >
              {pageId}
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/c/${collection}`)}
            >
              Open in database
            </Button>
            <Button
              size="sm"
              disabled={saving || !dirty}
              onClick={() => void savePage()}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
        {error ? (
          <p className="mt-2 text-sm text-destructive">{error}</p>
        ) : null}
      </div>

      <div className="grid flex-1 gap-8 overflow-auto px-6 py-6 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <aside className="space-y-4">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            Properties
          </p>
          {propertyFields.length === 0 ? (
            <p className="text-xs text-muted-foreground">No properties</p>
          ) : (
            propertyFields.map((field) => (
              <div key={field.name} className="space-y-1.5">
                <Label htmlFor={`page-field-${field.name}`}>
                  {field.name}
                  <span className="ml-1 text-muted-foreground">
                    ({field.type}
                    {field.type === 'relation' && field.relationTarget
                      ? ` → ${field.relationTarget}`
                      : ''}
                    )
                  </span>
                </Label>
                {field.type === 'relation' && field.relationTarget ? (
                  <div className="space-y-1.5">
                    <FieldControl
                      field={field}
                      value={draft[field.name] ?? ''}
                      options={relationOptions[field.relationTarget] ?? []}
                      onChange={(value) => setDraftField(field.name, value)}
                      idPrefix="page-field"
                    />
                    {draft[field.name] ? (
                      <Link
                        href={pageHref(
                          draft[field.name] ?? '',
                          field.relationTarget,
                        )}
                        className="text-xs text-primary underline-offset-4 hover:underline"
                      >
                        Open page
                      </Link>
                    ) : null}
                  </div>
                ) : (
                  <FieldControl
                    field={field}
                    value={draft[field.name] ?? ''}
                    options={[]}
                    onChange={(value) => setDraftField(field.name, value)}
                    idPrefix="page-field"
                  />
                )}
              </div>
            ))
          )}

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
                No related pages visible to you.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {related.outgoing.map((neighbor) => (
                  <li key={`out-${neighbor.field}-${neighbor.recordId}`}>
                    <span className="text-muted-foreground">
                      {neighbor.field} →{' '}
                    </span>
                    <Link
                      href={pageHref(neighbor.recordId, neighbor.collection)}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {neighbor.label ?? neighbor.recordId.slice(0, 8)}
                    </Link>
                  </li>
                ))}
                {related.incoming.map((neighbor) => (
                  <li key={`in-${neighbor.collection}-${neighbor.recordId}`}>
                    <span className="text-muted-foreground">
                      ← {neighbor.collection}.{neighbor.field}{' '}
                    </span>
                    <Link
                      href={pageHref(neighbor.recordId, neighbor.collection)}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {neighbor.label ?? neighbor.recordId.slice(0, 8)}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase">
              History
            </p>
            {revisionsLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : revisions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No revisions yet.</p>
            ) : (
              <ul className="space-y-2">
                {revisions.map((revision) => (
                  <li
                    key={`${revision.revision}-${revision.validFrom}`}
                    className="rounded-md border border-border px-3 py-2 text-xs"
                  >
                    <p className="font-medium">Revision {revision.revision}</p>
                    <p className="text-muted-foreground">
                      {formatWhen(revision.validFrom)}
                      {revision.principalId ? ` · ${revision.principalId}` : ''}
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
        </aside>

        <section className="min-w-0 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            Body
          </p>
          {bodyField ? (
            <FieldControl
              field={bodyField}
              value={draft[bodyField.name] ?? ''}
              options={[]}
              onChange={(value) => setDraftField(bodyField.name, value)}
              idPrefix="page-body"
              rows={18}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              This database has no prose body field.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
