'use client';

import type { WidgetTokenScope } from '@kitsuneos/workos';
import {
  AdminPortalAuditLogStreaming,
  AdminPortalDomainVerification,
  AdminPortalSsoConnection,
  DirectorySync,
  UserSecurity,
  UsersManagement,
  WorkOsWidgets,
} from '@workos-inc/widgets';
import { OperateLoadingBlock } from '@/components/operate/loading-block';
import { SettingsCallout } from '@/components/settings/settings-section';
import { useWorkOsWidgetToken } from '@/hooks/use-workos-widget-token';

function WidgetShell({
  scopes,
  children,
  emptyHint,
}: {
  scopes?: WidgetTokenScope[];
  children: (token: string) => React.ReactNode;
  emptyHint: string;
}) {
  const { token, error, loading } = useWorkOsWidgetToken(scopes);

  if (loading) {
    return <OperateLoadingBlock />;
  }
  if (error || !token) {
    return (
      <SettingsCallout>
        {error ?? emptyHint} Configure `WORKOS_API_KEY` and sync the workspace
        organization to enable this surface.
      </SettingsCallout>
    );
  }

  return (
    <WorkOsWidgets
      theme={{
        appearance: 'dark',
        accentColor: 'orange',
        grayColor: 'sand',
        radius: 'medium',
      }}
    >
      {children(token)}
    </WorkOsWidgets>
  );
}

/** WorkOS User Management — invites, roles, remove members. */
export function WorkOsPeopleWidget() {
  return (
    <WidgetShell
      scopes={['widgets:users-table:manage']}
      emptyHint="WorkOS People is unavailable."
    >
      {(token) => <UsersManagement authToken={token} />}
    </WidgetShell>
  );
}

/** WorkOS User Security — password + MFA. */
export function WorkOsSecurityWidget() {
  return (
    <WidgetShell emptyHint="WorkOS Security (MFA) is unavailable.">
      {(token) => <UserSecurity authToken={token} />}
    </WidgetShell>
  );
}

/** WorkOS SSO connection setup (Admin Portal embed). */
export function WorkOsSsoWidget() {
  return (
    <WidgetShell
      scopes={['widgets:sso:manage']}
      emptyHint="WorkOS SSO is unavailable."
    >
      {(token) => <AdminPortalSsoConnection authToken={token} />}
    </WidgetShell>
  );
}

/** WorkOS Directory Sync. */
export function WorkOsDirectorySyncWidget() {
  return (
    <WidgetShell
      scopes={['widgets:dsync:manage']}
      emptyHint="WorkOS Directory Sync is unavailable."
    >
      {(token) => <DirectorySync authToken={token} />}
    </WidgetShell>
  );
}

/** WorkOS domain verification. */
export function WorkOsDomainWidget() {
  return (
    <WidgetShell
      scopes={['widgets:domain-verification:manage']}
      emptyHint="WorkOS domain verification is unavailable."
    >
      {(token) => <AdminPortalDomainVerification authToken={token} />}
    </WidgetShell>
  );
}

/** WorkOS Audit Log streaming (security/settings events only). */
export function WorkOsAuditStreamingWidget() {
  return (
    <WidgetShell
      scopes={['widgets:audit-log-streaming:manage']}
      emptyHint="WorkOS Audit Log streaming is unavailable."
    >
      {(token) => <AdminPortalAuditLogStreaming authToken={token} />}
    </WidgetShell>
  );
}
