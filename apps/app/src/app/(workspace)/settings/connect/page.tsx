'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SettingsNav } from '@/components/settings/settings-nav';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type GuideId = 'cursor' | 'claude' | 'custom';

export default function SettingsConnectPage() {
  const [origin, setOrigin] = useState('');
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [guide, setGuide] = useState<GuideId>('cursor');

  useEffect(() => {
    setOrigin(window.location.origin);
    void fetch('/api/me')
      .then(async (response) => {
        const body = (await response.json()) as {
          apiKeyPlaintext?: string | null;
          error?: string;
        };
        if (!response.ok) {
          setError(body.error ?? 'Could not load your account');
          return;
        }
        if (body.apiKeyPlaintext) {
          setApiKey(body.apiKeyPlaintext);
        }
      })
      .catch(() => setError('Could not load your account'));
  }, []);

  const keyForConfig = apiKey ?? 'YOUR_API_KEY';

  const cursorConfig = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            kitsuneos: {
              url: `${origin}/api/mcp/tools`,
              headers: {
                Authorization: `Bearer ${keyForConfig}`,
              },
            },
          },
        },
        null,
        2,
      ),
    [origin, keyForConfig],
  );

  const claudeConfig = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            kitsuneos: {
              url: `${origin}/api/mcp/tools`,
              headers: {
                Authorization: `Bearer ${keyForConfig}`,
              },
            },
          },
        },
        null,
        2,
      ),
    [origin, keyForConfig],
  );

  const customSnippet = useMemo(
    () =>
      [
        `# List tools`,
        `curl -s ${origin}/api/mcp/tools \\`,
        `  -H "Authorization: Bearer ${keyForConfig}"`,
        ``,
        `# Call a tool`,
        `curl -s -X POST ${origin}/api/mcp/tools/call \\`,
        `  -H "Authorization: Bearer ${keyForConfig}" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -d '{"tool":"describe_schema","arguments":{}}'`,
      ].join('\n'),
    [origin, keyForConfig],
  );

  const generateKey = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/me/api-key', { method: 'POST' });
      const body = (await response.json()) as {
        apiKeyPlaintext?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? 'Could not create a key');
      }
      if (!body.apiKeyPlaintext) {
        throw new Error('No key returned');
      }
      setApiKey(body.apiKeyPlaintext);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a key');
    } finally {
      setBusy(false);
    }
  }, []);

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(''), 2000);
    } catch {
      setError('Could not copy — select the text and copy manually.');
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <SettingsNav />
      <div className="mx-auto w-full max-w-3xl space-y-10 p-6">
        <div className="space-y-2">
          <h2 className="text-lg font-medium">Connect an AI helper</h2>
          <p className="text-sm text-muted-foreground">
            Three steps: create a key, paste a config into your AI app, then
            decide what the AI is allowed to do under Access.
          </p>
        </div>

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <section className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">1. Your connection key</h3>
              <p className="text-xs text-muted-foreground">
                Treat this like a password. Anyone with it can act as you in
                KitsuneOS. It is shown once when created.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void generateKey()}
            >
              {busy ? 'Creating…' : apiKey ? 'Create a new key' : 'Create key'}
            </Button>
          </div>
          {apiKey ? (
            <div className="space-y-2">
              <code className="block break-all rounded-md bg-muted p-3 font-mono text-xs">
                {apiKey}
              </code>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void copyText('key', apiKey)}
              >
                {copied === 'key' ? 'Copied' : 'Copy key'}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No key on screen yet. Create one to unlock the guides below.
            </p>
          )}
        </section>

        <section className="space-y-4 rounded-lg border border-border p-4">
          <div>
            <h3 className="text-sm font-medium">2. Pick your AI app</h3>
            <p className="text-xs text-muted-foreground">
              Copy the block for your tool and paste it where that app stores
              MCP / connector settings.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['cursor', 'Cursor'],
                ['claude', 'Claude Desktop'],
                ['custom', 'Other / HTTP'],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                size="sm"
                variant={guide === id ? 'default' : 'outline'}
                onClick={() => setGuide(id)}
              >
                {label}
              </Button>
            ))}
          </div>

          {guide === 'cursor' ? (
            <GuideBlock
              title="Cursor"
              steps={[
                'In Cursor, open Settings → MCP.',
                'Add a new server (or edit ~/.cursor/mcp.json).',
                'Paste the JSON below, save, and restart Cursor if needed.',
                'Ask Cursor to “describe my KitsuneOS schema” to confirm it connected.',
              ]}
              value={cursorConfig}
              copied={copied === 'cursor'}
              onCopy={() => void copyText('cursor', cursorConfig)}
            />
          ) : null}

          {guide === 'claude' ? (
            <GuideBlock
              title="Claude Desktop"
              steps={[
                'Open Claude Desktop → Settings → Developer.',
                'Edit the config file (claude_desktop_config.json).',
                'Paste the JSON below inside mcpServers and restart Claude.',
                'Start a chat and ask Claude to list your KitsuneOS databases.',
              ]}
              value={claudeConfig}
              copied={copied === 'claude'}
              onCopy={() => void copyText('claude', claudeConfig)}
            />
          ) : null}

          {guide === 'custom' ? (
            <GuideBlock
              title="Any tool that can call HTTPS"
              steps={[
                'Send your key as an Authorization: Bearer header.',
                'GET /api/mcp/tools lists available actions.',
                'POST /api/mcp/tools/call runs an action with JSON { tool, arguments }.',
              ]}
              value={customSnippet}
              copied={copied === 'custom'}
              onCopy={() => void copyText('custom', customSnippet)}
            />
          ) : null}

          {!apiKey ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Create a key first — the samples above still say YOUR_API_KEY
              until you do.
            </p>
          ) : null}
        </section>

        <section className="space-y-3 rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium">3. Decide what the AI can do</h3>
          <p className="text-sm text-muted-foreground">
            By default, AI helpers should only <strong>suggest changes</strong>.
            Those suggestions land in Inbox so you can approve or reject them.
            Open Access to adjust permissions per database.
          </p>
          <Button asChild size="sm" variant="outline">
            <a href="/settings/access">Open Access settings</a>
          </Button>
        </section>
      </div>
    </div>
  );
}

function GuideBlock({
  title,
  steps,
  value,
  copied,
  onCopy,
}: {
  title: string;
  steps: string[];
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <Textarea
        readOnly
        value={value}
        className="min-h-40 font-mono text-xs"
        aria-label={`${title} config`}
      />
      <Button size="sm" variant="secondary" onClick={onCopy}>
        {copied ? 'Copied' : `Copy ${title} config`}
      </Button>
    </div>
  );
}
