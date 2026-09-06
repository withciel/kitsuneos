'use client';

import { FilePlus2, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { pageHref } from '@/lib/page';
import { cn } from '@/lib/utils';
import {
  OPEN_COMMAND_PALETTE_EVENT,
  WORKSPACE_CHANGED_EVENT,
} from '@/lib/workspace-events';

interface SearchHit {
  collection: string;
  recordId: string;
  label: string;
  excerpt: string;
  href: string;
  score: number;
}

type PaletteItem =
  | { kind: 'action'; id: string; label: string; hint: string }
  | { kind: 'result'; id: string; hit: SearchHit };

export function CommandPalette() {
  const router = useRouter();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const reset = useCallback(() => {
    setQuery('');
    setResults([]);
    setActiveIndex(0);
    setError('');
    setCreating(false);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((prev) => {
          if (prev) {
            reset();
            return false;
          }
          return true;
        });
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenEvent);
    };
  }, [reset]);

  useEffect(() => {
    function onWorkspaceChanged() {
      // Drop stale hits after workspace switch; reopen still works with ⌘K.
      reset();
      if (open) {
        setError('');
      }
    }
    window.addEventListener(WORKSPACE_CHANGED_EVENT, onWorkspaceChanged);
    return () => {
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, onWorkspaceChanged);
    };
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
    return () => window.clearTimeout(handle);
  }, [open]);

  useEffect(() => {
    abortRef.current?.abort();
    const q = query.trim();
    if (!open || q.length === 0) {
      setResults([]);
      setActiveIndex(0);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const handle = window.setTimeout(() => {
      void fetch(`/api/search?q=${encodeURIComponent(q)}&limit=12`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          const body = (await response.json()) as {
            results?: SearchHit[];
            error?: string;
          };
          if (!response.ok) {
            throw new Error(body.error ?? 'Search failed');
          }
          setResults(body.results ?? []);
          setActiveIndex(0);
          setError('');
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setResults([]);
          setError(err instanceof Error ? err.message : String(err));
        });
    }, 120);
    return () => {
      window.clearTimeout(handle);
      controller.abort();
    };
  }, [open, query]);

  const items: PaletteItem[] = [
    {
      kind: 'action',
      id: 'new-note',
      label: 'New note',
      hint: 'Create a private note',
    },
    ...results.map((hit) => ({
      kind: 'result' as const,
      id: `${hit.collection}:${hit.recordId}`,
      hit,
    })),
  ];

  async function createNote() {
    if (creating) return;
    setCreating(true);
    setError('');
    try {
      // Schema GET backfills notes for older workspaces.
      await fetch('/api/schema');
      const response = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection: 'notes',
          record: { title: 'Untitled', body: '', tags: '' },
        }),
      });
      const body = (await response.json()) as {
        recordId?: string;
        error?: string;
      };
      if (!response.ok || typeof body.recordId !== 'string') {
        throw new Error(body.error ?? 'Failed to create note');
      }
      close();
      startTransition(() => {
        router.push(pageHref(body.recordId!, 'notes'));
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCreating(false);
    }
  }

  function activate(item: PaletteItem) {
    if (item.kind === 'action') {
      void createNote();
      return;
    }
    close();
    startTransition(() => {
      router.push(item.hit.href);
    });
  }

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(items.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = items[activeIndex];
      if (item) activate(item);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else setOpen(true);
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>
            Search pages or create a private note
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            id={inputId}
            className="h-11 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            placeholder="Search pages or create a note…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
            ⌘K
          </kbd>
        </div>
        <div className="max-h-80 overflow-auto py-2">
          {error ? (
            <p className="px-3 py-2 text-sm text-destructive">{error}</p>
          ) : null}
          <div className="px-1" role="listbox" aria-labelledby={inputId}>
            {items.map((item, index) => {
              const active = index === activeIndex;
              if (item.kind === 'action') {
                return (
                  <div key={item.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm',
                        active ? 'bg-accent text-accent-foreground' : '',
                      )}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => activate(item)}
                      disabled={creating || pending}
                    >
                      <FilePlus2 className="size-4 shrink-0" />
                      <span className="font-medium">{item.label}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {creating ? 'Creating…' : item.hint}
                      </span>
                    </button>
                  </div>
                );
              }
              return (
                <div key={item.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={cn(
                      'flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left',
                      active ? 'bg-accent text-accent-foreground' : '',
                    )}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => activate(item)}
                  >
                    <span className="text-sm font-medium">
                      {item.hit.label}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {item.hit.collection}
                      {item.hit.excerpt ? ` · ${item.hit.excerpt}` : ''}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
          {query.trim() && results.length === 0 && !error ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              No matching pages
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
