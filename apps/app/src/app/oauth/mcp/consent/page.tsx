// workspace-lint: ignore — MCP OAuth binds workspace from the authenticated
// session (requireWorkspace / token claims), never from client request params.
import { Button } from '@/components/ui/button';
import { engine } from '@/lib/engine';
import { ensureMcpOAuthTables } from '@/lib/mcp-oauth';
import { requireWorkspace } from '@/lib/require-workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PendingRow {
  id: string;
  client_id: string;
  workspace_id: string;
  principal_id: string;
  scope: string;
  csrf_token: string;
  expires_at: string;
}

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

  await ensureMcpOAuthTables(engine);

  const pendingResult = await engine.ownerPool.query<PendingRow>(
    `SELECT id, client_id, workspace_id, principal_id, scope, csrf_token, expires_at
       FROM kitsune.mcp_oauth_pending WHERE id = $1`,
    [pendingId],
  );
  const pending = pendingResult.rows[0];

  if (!pending || new Date(pending.expires_at).getTime() < Date.now()) {
    return (
      <ConsentShell
        title="Authorization request expired"
        body="This request expired or was already used. Restart the connection from your AI client."
      />
    );
  }

  if (
    pending.workspace_id !== workspace.workspaceId ||
    pending.principal_id !== workspace.principalId
  ) {
    return (
      <ConsentShell
        title="Signed in as a different account"
        body="This authorization request belongs to a different signed-in account. Sign in as the right user and restart the connection."
      />
    );
  }

  const clientResult = await engine.ownerPool.query<{
    client_name: string;
  }>(`SELECT client_name FROM kitsune.mcp_oauth_clients WHERE client_id = $1`, [
    pending.client_id,
  ]);
  const clientName = clientResult.rows[0]?.client_name ?? pending.client_id;

  const workspaceResult = await engine.ownerPool.query<{
    name: string | null;
    slug: string;
  }>(`SELECT name, slug FROM kitsune.workspaces WHERE id = $1`, [
    pending.workspace_id,
  ]);
  const workspaceLabel =
    workspaceResult.rows[0]?.name ||
    workspaceResult.rows[0]?.slug ||
    pending.workspace_id;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            MCP access request
          </p>
          <h1 className="text-lg font-semibold text-foreground">
            {clientName}
          </h1>
          <p className="text-sm text-muted-foreground">
            wants to connect to your KitsuneOS workspace.
          </p>
        </div>

        <dl className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Workspace</dt>
            <dd className="font-medium text-foreground">{workspaceLabel}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Scope</dt>
            <dd className="font-mono text-xs text-foreground">
              {pending.scope}
            </dd>
          </div>
        </dl>

        <p className="text-xs text-muted-foreground">
          Approving lets {clientName} call MCP tools as you in this workspace,
          until you revoke access.
        </p>

        <form
          method="post"
          action="/api/mcp/oauth/consent"
          className="flex gap-2"
        >
          <input type="hidden" name="pendingId" value={pending.id} />
          <input type="hidden" name="csrfToken" value={pending.csrf_token} />
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
