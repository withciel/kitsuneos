'use client';

import type { AttachmentMeta } from '@kitsuneos/core';
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { FieldMeta } from '@/components/page/field-control';
import { Button } from '@/components/ui/button';
import { pickBodyField } from '@/lib/page';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Prefer prose `body`, else first writable non-id field. */
export function pickAttachField(
  fields: readonly FieldMeta[],
): FieldMeta | undefined {
  const body = pickBodyField(fields);
  if (body) return body;
  return fields.find((field) => field.name !== 'id' && field.writable);
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Could not read file'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export function MediaLibrary({
  collection,
  recordId,
  fields,
  canUpload,
}: {
  collection: string;
  recordId: string;
  fields: FieldMeta[];
  canUpload: boolean;
}) {
  const attachField = useMemo(() => pickAttachField(fields), [fields]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<AttachmentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        collection,
        recordId,
      });
      if (attachField) params.set('fieldName', attachField.name);
      const response = await fetch(`/api/attachments?${params.toString()}`);
      const body = (await response.json()) as {
        attachments?: AttachmentMeta[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? 'Failed to load attachments');
      }
      setItems(body.attachments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [attachField, collection, recordId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !attachField) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`File exceeds ${formatBytes(MAX_UPLOAD_BYTES)} limit`);
      return;
    }
    setUploading(true);
    setError('');
    try {
      const contentBase64 = await readFileAsBase64(file);
      const response = await fetch('/api/attachments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection,
          recordId,
          fieldName: attachField.name,
          contentType: file.type || 'application/octet-stream',
          contentBase64,
          fileName: file.name,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? 'Upload failed');
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  if (!attachField) {
    return (
      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-xs font-medium text-muted-foreground uppercase">
          Media
        </p>
        <p className="text-xs text-muted-foreground">
          No writable field available to attach files.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase">
            Media
          </p>
          <p className="text-xs text-muted-foreground">
            Attached to <code className="font-mono">{attachField.name}</code> ·
            max {formatBytes(MAX_UPLOAD_BYTES)}
          </p>
        </div>
        {canUpload ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              disabled={uploading}
              onChange={(event) => void onFileChange(event)}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </Button>
          </>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No attachments yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {item.fileName ?? item.contentHash.slice(0, 12)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.contentType} · {formatBytes(item.byteSize)}
                </p>
              </div>
              <a
                className="text-xs text-primary underline-offset-4 hover:underline"
                href={`/api/attachments/${item.id}`}
                target="_blank"
                rel="noreferrer"
              >
                Download
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
