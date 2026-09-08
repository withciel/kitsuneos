// workspace-lint: ignore — MCP OAuth binds workspace from the authenticated
// session (requireWorkspace / token claims), never from client request params.
import { loadMcpOAuthConsentPage } from '@kitsuneos/server';
import { Button } from '@/components/ui/button';
import { engine } from '@/lib/engine';
import { requireWorkspace } from '@/lib/require-workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * MCP OAuth consent screen. AuthKit middleware enforces sign-in on this
 * path (not in unauthenticatedPaths), so requireWorkspace() below always
 * resolves an authenticated principal by the time this renders.
 */
export default async function McpConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ pending?: string }>;
}) {
  const { pending: pendingId } = await searchParams;
  const workspace = await requireWorkspace();

  if (!pendingId) {
    return (
      <ConsentShell
        title="Missing authorization request"
        body="No pending request id was provided. Restart the connection from your AI client."
      />
    );
  }

  const loaded = await loadMcpOAuthConsentPage(engine, {
    pendingId,
    workspaceId: workspace.workspaceId,
    principalId: workspace.principalId,
  });

  if (!loaded.ok) {
    if (loaded.reason === 'wrong_account') {
      return (
        <ConsentShell
          title="Signed in as a different account"
          body="This authorization request belongs to a different signed-in account. Sign in as the right user and restart the connection."
        />
      );
    }
    return (
      <ConsentShell
        title="Authorization request expired"
        body="This request expired or was already used. Restart the connection from your AI client."
      />
    );
  }

  const { data } = loaded;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            MCP access request
          </p>
          <h1 className="text-lg font-semibold text-foreground">
            {data.clientName}
          </h1>
          <p className="text-sm text-muted-foreground">
            wants to connect to your KitsuneOS workspace.
          </p>
        </div>

        <dl className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Workspace</dt>
            <dd className="font-medium text-foreground">
              {data.workspaceLabel}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Scope</dt>
            <dd className="font-mono text-xs text-foreground">{data.scope}</dd>
          </div>
        </dl>

        <p className="text-xs text-muted-foreground">
          Approving lets {data.clientName} call MCP tools as you in this
          workspace, until you revoke access.
        </p>

        <form
          method="post"
          action="/api/mcp/oauth/consent"
          className="flex gap-2"
        >
          <input type="hidden" name="pendingId" value={data.pendingId} />
          <input type="hidden" name="csrfToken" value={data.csrfToken} />
          <Button
            type="submit"
            name="decision"
            value="deny"
            variant="outline"
            className="flex-1"
          >
            Deny
          </Button>
          <Button
            type="submit"
            name="decision"
            value="approve"
            className="flex-1"
          >
            Approve
          </Button>
        </form>
      </div>
    </div>
  );
}

function ConsentShell({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <p className="text-sm font-medium text-destructive">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
