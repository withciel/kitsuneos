'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AgentsPanel } from '@/components/settings/agents-panel';
import { OAuthAppsPanel } from '@/components/settings/oauth-apps-panel';
import { SettingsNav } from '@/components/settings/settings-nav';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type GuideId = 'local' | 'cursor-remote' | 'claude-remote' | 'rest';

export default function SettingsConnectPage() {
  const [origin, setOrigin] = useState('');
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [guide, setGuide] = useState<GuideId>('local');

  useEffect(() => {
    setOrigin(window.location.origin);
    void fetch('/api/me')
      .then(async (response) => {
        const body = (await response.json()) as {
          apiKeyPlaintext?: string | null;
          hasApiKey?: boolean;
          error?: string;
        };
        if (!response.ok) {
          setError(body.error ?? 'Could not load your account');
          return;
        }
        if (body.apiKeyPlaintext) {
          setApiKey(body.apiKeyPlaintext);
        }
        setHasApiKey(Boolean(body.hasApiKey || body.apiKeyPlaintext));
      })
      .catch(() => setError('Could not load your account'));
  }, []);

  const keyForConfig = apiKey ?? 'YOUR_API_KEY';

  const localStdioConfig = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            kitsuneos: {
              command: 'npx',
              args: ['-y', 'kitsuneos-mcp'],
              env: {
                KITSUNE_WORKSPACE_ID: 'YOUR_WORKSPACE_ID',
                KITSUNE_PRINCIPAL_ID: 'YOUR_PRINCIPAL_ID',
                KITSUNE_APP_URL: 'postgresql://…',
                KITSUNE_OWNER_URL: 'postgresql://…',
              },
            },
          },
        },
        null,
        2,
      ),
    [],
  );

  const cursorRemoteConfig = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            kitsuneos: {
              url: `${origin}/api/mcp`,
            },
          },
        },
        null,
        2,
      ),
    [origin],
  );

  const claudeRemoteSteps = useMemo(
    () =>
      [
        'In Claude (web or desktop), open Settings → Connectors.',
        'Add a custom connector.',
        `Remote MCP URL: ${origin}/api/mcp`,
        'Complete the OAuth consent when prompted (no API key paste).',
        'Enable tools for the conversation, then ask Claude to describe your schema.',
      ].join('\n'),
    [origin],
  );

  const restSnippet = useMemo(
    () =>
      [
        `# Legacy REST helper API — NOT the MCP protocol.`,
        `# Prefer /api/mcp (Streamable HTTP) for Cursor / Claude.`,
        ``,
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
    if (hasApiKey) {
      const ok = window.confirm(
        'Creating a new key revokes your existing key. AI helpers using the old key will stop working until you update their config. Continue?',
      );
      if (!ok) return;
    }
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
      setHasApiKey(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a key');
    } finally {
      setBusy(false);
    }
  }, [hasApiKey]);

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
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Step 3 of 4 · Activation
          </p>
          <h2 className="text-lg font-medium">Connect an AI helper</h2>
          <p className="text-sm text-muted-foreground">
            KitsuneOS speaks real MCP over local stdio and remote Streamable
            HTTP. Pick the guide that matches your client — do not paste the
            legacy REST URL into Claude Desktop or Cursor as if it were MCP.
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
              <h3 className="text-sm font-medium">1. API key (optional)</h3>
              <p className="text-xs text-muted-foreground">
                Only for legacy REST scripts. Cursor remote and Claude
                connectors sign in with OAuth — no key paste. Treat the key like
                a password; it is shown once.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void generateKey()}
            >
              {busy
                ? 'Creating…'
                : apiKey || hasApiKey
                  ? 'Rotate key'
                  : 'Create key'}
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
          ) : hasApiKey ? (
            <p className="text-sm text-muted-foreground">
              A key is already active for this workspace. It is only shown once
              when created — use the guides below with the key you saved, or
              rotate to mint a new one (this revokes the old key).
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No key on screen yet. Create one only if you need the legacy REST
              guide.
            </p>
          )}
        </section>

        <section className="space-y-4 rounded-lg border border-border p-4">
          <div>
            <h3 className="text-sm font-medium">2. Pick your AI app</h3>
            <p className="text-xs text-muted-foreground">
              Local stdio works offline. Remote MCP uses{' '}
              <code className="font-mono text-[11px]">{origin}/api/mcp</code>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['local', 'Local stdio'],
                ['cursor-remote', 'Cursor remote'],
                ['claude-remote', 'Claude connector'],
                ['rest', 'Legacy REST'],
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

          {guide === 'local' ? (
            <GuideBlock
              title="Claude Desktop / Cursor (local stdio)"
              steps={[
                'Build the MCP package (`pnpm --filter @kitsuneos/mcp build`) or use the npx bin after publish.',
                'Paste this into Claude Desktop Developer config or Cursor MCP settings.',
                'Fill workspace/principal IDs and Postgres URLs (pnpm quickstart prints a ready block).',
                'Restart the client and ask it to describe your KitsuneOS schema.',
                'Troubleshooting: a Cursor log id like mcp-server-user-…-empty-window is Cursor’s internal id, not a missing Kitsune workspace UUID — open a folder and use a valid MCP config.',
              ]}
              value={localStdioConfig}
              copied={copied === 'local'}
              onCopy={() => void copyText('local', localStdioConfig)}
            />
          ) : null}

          {guide === 'cursor-remote' ? (
            <GuideBlock
              title="Cursor (remote Streamable HTTP + OAuth)"
              steps={[
                'In Cursor, open Settings → MCP.',
                'Add a server with a url (not command). Do not add Authorization headers.',
                `Paste ${origin}/api/mcp — Cursor discovers OAuth and opens a browser login.`,
                'Approve access for your workspace when prompted, then return to Cursor.',
                'Ask Cursor to describe your schema to confirm initialize + tools/call work.',
              ]}
              value={cursorRemoteConfig}
              copied={copied === 'cursor-remote'}
              onCopy={() => void copyText('cursor-remote', cursorRemoteConfig)}
            />
          ) : null}

          {guide === 'claude-remote' ? (
            <GuideBlock
              title="Claude Web / Desktop custom connector"
              steps={[
                'Requires the remote OAuth MCP endpoint (already at /api/mcp).',
                'Do not paste a url block into claude_desktop_config.json — Desktop local configs are stdio only.',
                'Use Connectors → Add custom connector with the URL below and finish OAuth.',
              ]}
              value={claudeRemoteSteps}
              copied={copied === 'claude-remote'}
              onCopy={() => void copyText('claude-remote', claudeRemoteSteps)}
            />
          ) : null}

          {guide === 'rest' ? (
            <GuideBlock
              title="Legacy REST (scripts / curl only)"
              steps={[
                'This is NOT MCP. Claude Desktop and Cursor remote configs must not use these URLs.',
                'Sunset: prefer /api/mcp. REST remains until the next major release.',
                'Send Authorization: Bearer with your API key.',
              ]}
              value={restSnippet}
              copied={copied === 'rest'}
              onCopy={() => void copyText('rest', restSnippet)}
            />
          ) : null}

          {guide === 'rest' && !apiKey && !hasApiKey ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Create a key first — the REST sample still says YOUR_API_KEY until
              you do.
            </p>
          ) : null}
          {guide === 'rest' && !apiKey && hasApiKey ? (
            <p className="text-xs text-muted-foreground">
              Paste the key you saved earlier into the REST sample (replace
              YOUR_API_KEY), or rotate above to reveal a new one.
            </p>
          ) : null}
        </section>

        <AgentsPanel />

        <OAuthAppsPanel />

        <section className="space-y-3 rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium">3. Decide what the AI can do</h3>
          <p className="text-sm text-muted-foreground">
            Mutating tools should land as proposals in Inbox unless you grant
            write/admin. Open Access to adjust permissions per collection.
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
