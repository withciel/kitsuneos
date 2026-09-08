'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { VAULT_ZIP_LIMITS } from '@/lib/vault-zip-limits';

interface CollectionOption {
  name: string;
}

interface ImportResponse {
  changeSetIds: string[];
  imported: number;
  errors: { path: string; message: string }[];
}

type Mode = 'propose' | 'direct';

const CLI_FALLBACK = [
  '# Large vault? Skip the browser upload and run the CLI directly against Postgres:',
  'kitsuneos ingest --source kb --path ./vault --collection notes --mode propose',
  '',
  '# Full grant-filtered export (schema + rows, not just one collection):',
  'kitsuneos export',
].join('\n');

/**
 * Markdown vault import/export. Import parses a zip of `.md` files into
 * `engine.ingest` (default `propose` → lands in Changes for review). Export
 * downloads a zip of one markdown file per record, already filtered by page
 * ACL server-side — private/excluded pages are silently omitted here, never
 * a permission error.
 */
export function VaultPanel() {
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [collection, setCollection] = useState('notes');
  const [mode, setMode] = useState<Mode>('propose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetch('/api/schema')
      .then(async (response) => {
        const body = (await response.json()) as {
          collections?: CollectionOption[];
        };
        if (!response.ok) return;
        const list = body.collections ?? [];
        setCollections(list);
        if (!list.some((c) => c.name === 'notes') && list[0]) {
          setCollection(list[0].name);
        }
      })
      .catch(() => undefined);
  }, []);

  const runImport = useCallback(async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError('Choose a .zip file of markdown notes first.');
      return;
    }
    if (file.size > VAULT_ZIP_LIMITS.maxUploadBytes) {
      setError(
        `Zip exceeds the ${Math.round(VAULT_ZIP_LIMITS.maxUploadBytes / (1024 * 1024))} MB browser upload limit — use the CLI commands below for large vaults.`,
      );
      return;
    }
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const form = new FormData();
      form.set('collection', collection);
      form.set('mode', mode);
      form.set('file', file);
      const response = await fetch('/api/vault/import', {
        method: 'POST',
        body: form,
      });
      const body = (await response.json()) as ImportResponse & {
        error?: string;
      };
      if (!response.ok && !body.imported && !body.changeSetIds) {
        setError(body.error ?? 'Import failed');
        return;
      }
      setResult({
        changeSetIds: body.changeSetIds ?? [],
        imported: body.imported ?? 0,
        errors: body.errors ?? [],
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch {
      setError('Import failed — check the file and try again.');
    } finally {
      setBusy(false);
    }
  }, [collection, mode]);

  const runExport = useCallback(() => {
    setError('');
    window.location.href = `/api/vault/export?collection=${encodeURIComponent(collection)}`;
  }, [collection]);

  return (
    <section className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <h3 className="text-sm font-medium">Vault (markdown import/export)</h3>
        <p className="text-xs text-muted-foreground">
          Import a zip of <code className="font-mono">.md</code> files (
          <code className="font-mono">title</code> frontmatter + body) into a
          collection, or export one as a zip of markdown files. Export omits
          pages you cannot see instead of failing.
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="vault-collection" className="text-xs font-medium">
            Collection
          </Label>
          <Select value={collection} onValueChange={setCollection}>
            <SelectTrigger id="vault-collection" className="w-48">
              <SelectValue placeholder="Choose a collection…" />
            </SelectTrigger>
            <SelectContent>
              {(collections.length > 0 ? collections : [{ name: 'notes' }]).map(
                (c) => (
                  <SelectItem key={c.name} value={c.name}>
                    {c.name}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Import mode
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === 'propose' ? 'default' : 'outline'}
              onClick={() => setMode('propose')}
            >
              Propose
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === 'direct' ? 'default' : 'outline'}
              onClick={() => setMode('direct')}
            >
              Direct
            </Button>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Propose (default) lands imported records as change sets for review in{' '}
        <Link href="/changes" className="underline">
          Changes
        </Link>
        . Direct requires write/admin on the collection and writes immediately.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          className="text-sm"
          aria-label="Vault zip file"
        />
        <Button size="sm" disabled={busy} onClick={() => void runImport()}>
          {busy ? 'Importing…' : 'Import'}
        </Button>
        <Button size="sm" variant="outline" onClick={runExport}>
          Export
        </Button>
      </div>

      {result ? (
        <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
          <p>
            Imported <strong>{result.imported}</strong> record
            {result.imported === 1 ? '' : 's'}
            {result.changeSetIds.length > 0
              ? `, created ${result.changeSetIds.length} change set${result.changeSetIds.length === 1 ? '' : 's'}`
              : ''}
            .
          </p>
          {result.changeSetIds.length > 0 ? (
            <Button asChild size="sm" variant="secondary">
              <Link href="/changes">Review in Changes</Link>
            </Button>
          ) : null}
          {result.errors.length > 0 ? (
            <div className="space-y-1 text-destructive">
              <p className="font-medium">
                {result.errors.length} file
                {result.errors.length === 1 ? '' : 's'} failed:
              </p>
              <ul className="list-disc space-y-0.5 pl-5">
                {result.errors.map((e) => (
                  <li key={e.path}>
                    {e.path}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          Vault too large for the browser? Run the CLI against Postgres directly
          instead — same engine, no upload limit:
        </p>
        <Textarea
          readOnly
          value={CLI_FALLBACK}
          className="min-h-24 font-mono text-xs"
          aria-label="CLI fallback commands"
        />
      </div>
    </section>
  );
}
