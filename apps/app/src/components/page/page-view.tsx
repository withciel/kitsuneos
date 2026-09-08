'use client';

import type { JsonValue } from '@kitsuneos/core';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { OperateLoadingBlock } from '@/components/operate/loading-block';
import {
  cellText,
  draftToPayload,
  FieldControl,
  type FieldMeta,
  type RelationOption,
} from '@/components/page/field-control';
import { MediaLibrary } from '@/components/page/media-library';
import { ShareDialog } from '@/components/page/share-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useShellContext } from '@/hooks/use-shell-context';
import {
  changeRequestsTouchingPage,
  type OpenChangeRequestRef,
} from '@/lib/group-ops-by-page';
import { pageHref, pickBodyField, pickTitleField } from '@/lib/page';
import {
  isPublishableCollection,
  normalizePublishStatus,
  type PublishStatus,
  pickStatusField,
  publishStatusLabel,
} from '@/lib/publish-status';
import { recordLabel } from '@/lib/record-label';
import { loadRelationOptions } from '@/lib/relation-options';
import { useWorkspaceSession } from '@/lib/workspace-session';

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

interface BacklinkNeighbor {
  collection: string;
  recordId: string;
  label: string | null;
  rawTarget: string;
}

interface BacklinksResult {
  outgoing: BacklinkNeighbor[];
  incoming: BacklinkNeighbor[];
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

export function PageView({
  pageId,
  collection,
}: {
  pageId: string;
  collection: string;
}) {
  const router = useRouter();
  const {
    schema,
    loading: sessionLoading,
    refresh: refreshSession,
  } = useWorkspaceSession();
  const [fields, setFields] = useState<FieldMeta[]>([]);
  const [capability, setCapability] = useState('');
  const [row, setRow] = useState<Record<string, JsonValue> | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [relationOptions, setRelationOptions] = useState<
    Record<string, RelationOption[]>
  >({});
  const [related, setRelated] = useState<RelatedResult | null>(null);
  const [backlinks, setBacklinks] = useState<BacklinksResult | null>(null);
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [backlinksLoading, setBacklinksLoading] = useState(false);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [pendingChangeRequests, setPendingChangeRequests] = useState<
    OpenChangeRequestRef[]
  >([]);

  const titleField = useMemo(() => pickTitleField(fields), [fields]);
  const bodyField = useMemo(() => pickBodyField(fields), [fields]);
  const statusField = useMemo(() => pickStatusField(fields), [fields]);
  const publishable = useMemo(() => isPublishableCollection(fields), [fields]);
  const propertyFields = useMemo(
    () =>
      fields.filter(
        (field) =>
          field.name !== 'id' &&
          field.name !== titleField?.name &&
          field.name !== bodyField?.name &&
          !(publishable && statusField && field.name === statusField.name),
      ),
    [fields, titleField, bodyField, publishable, statusField],
  );
  const currentStatus = useMemo(() => {
    if (!statusField) return null;
    return normalizePublishStatus(
      draft[statusField.name] ?? cellText(row?.[statusField.name]),
    );
  }, [statusField, draft, row]);

  const reload = useCallback(
    async (opts?: { forceSchema?: boolean }) => {
      setLoading(true);
      setError('');
      try {
        const snap =
          !opts?.forceSchema && schema
            ? { schema, error: null as string | null }
            : await refreshSession();
        if (!snap.schema) {
          throw new Error(snap.error ?? 'Failed to load schema');
        }
        const meta = snap.schema.collections.find((c) => c.name === collection);
        if (!meta) {
          throw new Error(`Database not found: ${collection}`);
        }
        setFields(meta.fields);
        setCapability(meta.capability ?? '');

        const getRes = await fetch(`/api/records/${collection}/${pageId}`);
        const getBody = (await getRes.json()) as Record<string, JsonValue> & {
          error?: string;
        };
        if (!getRes.ok) {
          throw new Error(
            typeof getBody.error === 'string'
              ? getBody.error
              : 'Page not found',
          );
        }
        setRow(getBody);
        const next: Record<string, string> = {};
        for (const field of meta.fields) {
          next[field.name] = cellText(getBody[field.name]);
        }
        setDraft(next);
        setDirty(false);
        setRelationOptions(await loadRelationOptions(snap.schema.collections));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setRow(null);
      } finally {
        setLoading(false);
      }
    },
    [collection, pageId, schema, refreshSession],
  );

  useEffect(() => {
    if (sessionLoading && !schema) return;
    void reload();
  }, [reload, sessionLoading, schema]);

  useEffect(() => {
    let cancelled = false;
    setRelatedLoading(true);
    setBacklinksLoading(true);
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

    void fetch(
      `/api/backlinks?collection=${encodeURIComponent(collection)}&recordId=${encodeURIComponent(pageId)}`,
    )
      .then(async (response) => {
        const body = (await response.json()) as BacklinksResult & {
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok) {
          throw new Error(body.error ?? 'Failed to load backlinks');
        }
        setBacklinks({
          outgoing: body.outgoing ?? [],
          incoming: body.incoming ?? [],
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setBacklinks(null);
      })
      .finally(() => {
        if (!cancelled) setBacklinksLoading(false);
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

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/review')
      .then(async (response) => {
        const body = (await response.json()) as {
          changeSets?: Array<{
            id: string;
            title: string | null;
            operations: Array<{
              collection: string;
              recordId?: string | null;
            }>;
          }>;
        };
        if (cancelled || !response.ok) return;
        setPendingChangeRequests(
          changeRequestsTouchingPage(body.changeSets ?? [], collection, pageId),
        );
      })
      .catch(() => {
        if (!cancelled) setPendingChangeRequests([]);
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
      // Refresh wiki-link panel after prose save
      try {
        const blRes = await fetch(
          `/api/backlinks?collection=${encodeURIComponent(collection)}&recordId=${encodeURIComponent(pageId)}`,
        );
        const blBody = (await blRes.json()) as BacklinksResult & {
          error?: string;
        };
        if (blRes.ok) {
          setBacklinks({
            outgoing: blBody.outgoing ?? [],
            incoming: blBody.incoming ?? [],
          });
        }
      } catch {
        // keep prior backlinks
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function setPublishStatus(next: PublishStatus) {
    if (!statusField) return;
    setPublishing(true);
    setError('');
    try {
      const res = await fetch(`/api/records/${collection}/${pageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { [statusField.name]: next } }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Status update failed');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  }

  const canDirectEdit = fields.some((field) => field.writable);
  const canPublish =
    Boolean(statusField?.writable) && canDirectEdit && !publishing;

  const heading =
    (titleField ? draft[titleField.name] : '')?.trim() ||
    (row ? recordLabel(row) : '') ||
    'Untitled';

  useShellContext(
    !loading && row
      ? {
          title: heading,
          crumbs: [
            { label: collection, href: `/c/${collection}` },
            { label: 'Page' },
          ],
        }
      : null,
  );

  if (loading) {
    return <OperateLoadingBlock rows={4} />;
  }

  if (!row) {
    return (
      <div className="space-y-3 px-6 py-4">
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

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border px-6 py-4">
        <div className="flex flex-wrap items-start gap-3">
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
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {publishable && currentStatus ? (
                <Badge
                  variant={
                    currentStatus === 'published'
                      ? 'default'
                      : currentStatus === 'archived'
                        ? 'outline'
                        : 'secondary'
                  }
                  className="w-fit text-[10px] uppercase"
                >
                  {publishStatusLabel(currentStatus)}
                </Badge>
              ) : null}
              <span
                className="font-mono text-[10px] text-muted-foreground/70"
                title={pageId}
              >
                ID
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {publishable && statusField ? (
              <>
                {currentStatus !== 'published' ? (
                  <Button
                    size="sm"
                    disabled={!canPublish}
                    onClick={() => void setPublishStatus('published')}
                  >
                    Publish
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canPublish}
                    onClick={() => void setPublishStatus('draft')}
                  >
                    Unpublish
                  </Button>
                )}
                {currentStatus !== 'archived' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canPublish}
                    onClick={() => void setPublishStatus('archived')}
                  >
                    Archive
                  </Button>
                ) : null}
              </>
            ) : null}
            <ShareDialog collection={collection} recordId={pageId} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/c/${collection}`)}
            >
              Open in database
            </Button>
            <Button
              size="sm"
              disabled={saving || !dirty || !canDirectEdit}
              onClick={() => void savePage()}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
        {error ? (
          <p className="mt-2 text-sm text-destructive">{error}</p>
        ) : null}
        {!canDirectEdit ? (
          <div className="mt-3 border-l-2 border-border pl-3 text-sm text-muted-foreground">
            {capability === 'propose'
              ? 'You can suggest changes via an AI helper or Changes — this view is read-only for your access level.'
              : 'You can view this page, but your access does not include editing here.'}{' '}
            <Link
              href="/changes"
              className="text-primary underline-offset-4 hover:underline"
            >
              Open Changes
            </Link>
          </div>
        ) : null}

        {pendingChangeRequests.length > 0 ? (
          <div className="mt-3 border-l-2 border-primary/50 pl-3 text-sm">
            <p className="font-medium">
              {pendingChangeRequests.length === 1
                ? '1 open change request touches this page'
                : `${pendingChangeRequests.length} open change requests touch this page`}
            </p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {pendingChangeRequests.map((cr) => (
                <li key={cr.id}>
                  <Link
                    href={`/changes/${cr.id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {cr.title?.trim() || 'Untitled change request'}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="operate-enter grid flex-1 gap-8 overflow-auto px-6 py-6 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <aside className="space-y-4">
          <p className="text-xs font-medium text-muted-foreground">
            Properties
          </p>
          {propertyFields.length === 0 ? (
            <p className="text-xs text-muted-foreground">No properties</p>
          ) : (
            propertyFields.map((field) => (
              <div key={field.name} className="space-y-1.5">
                <Label
                  htmlFor={`page-field-${field.name}`}
                  title={
                    field.type === 'relation' && field.relationTarget
                      ? `${field.type} → ${field.relationTarget}`
                      : field.type
                  }
                >
                  {field.name}
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
            <p className="text-xs font-medium text-muted-foreground">Related</p>
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
            <p className="text-xs font-medium text-muted-foreground">Links</p>
            {backlinksLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : !backlinks ||
              (backlinks.outgoing.length === 0 &&
                backlinks.incoming.length === 0) ? (
              <p className="text-xs text-muted-foreground">
                No wiki-links yet. Use{' '}
                <code className="font-mono text-[10px]">[[Title]]</code> in the
                body.
              </p>
            ) : (
              <div className="space-y-3 text-sm">
                {backlinks.outgoing.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-medium text-muted-foreground">
                      Outgoing
                    </p>
                    <ul className="space-y-1.5">
                      {backlinks.outgoing.map((link, index) => (
                        <li
                          key={`wiki-out-${link.rawTarget}-${link.recordId || index}`}
                        >
                          {link.collection && link.recordId ? (
                            <Link
                              href={pageHref(link.recordId, link.collection)}
                              className="text-primary underline-offset-4 hover:underline"
                            >
                              {link.label ?? link.rawTarget}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">
                              [[{link.rawTarget}]] (unresolved)
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {backlinks.incoming.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-medium text-muted-foreground">
                      Backlinks
                    </p>
                    <ul className="space-y-1.5">
                      {backlinks.incoming.map((link) => (
                        <li key={`wiki-in-${link.collection}-${link.recordId}`}>
                          <Link
                            href={pageHref(link.recordId, link.collection)}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {link.label ?? link.recordId.slice(0, 8)}
                          </Link>
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            via [[{link.rawTarget}]]
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground">History</p>
            {revisionsLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : revisions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No revisions yet.</p>
            ) : (
              <ul className="space-y-2">
                {revisions.map((revision) => (
                  <li
                    key={`${revision.revision}-${revision.validFrom}`}
                    className="border-b border-border pb-2 text-xs last:border-0"
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
          <MediaLibrary
            collection={collection}
            recordId={pageId}
            fields={fields}
            canUpload={canDirectEdit}
          />
        </section>
      </div>
    </div>
  );
}
