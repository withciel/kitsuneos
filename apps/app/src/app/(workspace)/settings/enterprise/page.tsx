'use client';

import { useState } from 'react';
import { SettingsNav } from '@/components/settings/settings-nav';
import {
  SettingsCallout,
  SettingsPageHeader,
  SettingsSection,
} from '@/components/settings/settings-section';
import {
  WorkOsAuditStreamingWidget,
  WorkOsDirectorySyncWidget,
  WorkOsDomainWidget,
  WorkOsSsoWidget,
} from '@/components/settings/workos/workos-widgets';
import { Button } from '@/components/ui/button';

const PORTAL_INTENTS = [
  { intent: 'sso', label: 'SSO setup' },
  { intent: 'dsync', label: 'Directory Sync' },
  { intent: 'audit_logs', label: 'Audit Logs' },
  { intent: 'domain_verification', label: 'Domain verification' },
] as const;

export default function SettingsEnterprisePage() {
  const [portalError, setPortalError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function openPortal(intent: string) {
    setBusy(intent);
    setPortalError('');
    try {
      const response = await fetch('/api/workos/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent,
          returnUrl: window.location.href,
        }),
      });
      const body = (await response.json()) as { link?: string; error?: string };
      if (!response.ok || !body.link) {
        setPortalError(body.error ?? 'Could not open Admin Portal');
        return;
      }
      window.location.assign(body.link);
    } catch {
      setPortalError('Could not open Admin Portal');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-8">
      <SettingsPageHeader
        title="Enterprise"
        description="SSO, Directory Sync, domains, and Admin Portal — powered by WorkOS."
      />
      <SettingsNav />

      <SettingsSection
        title="Admin Portal"
        description="Hand IT admins a WorkOS-hosted setup flow for SSO, SCIM, and audit log destinations."
      >
        <div className="flex flex-wrap gap-2">
          {PORTAL_INTENTS.map((item) => (
            <Button
              key={item.intent}
              size="sm"
              variant="outline"
              disabled={busy === item.intent}
              onClick={() => void openPortal(item.intent)}
            >
              {busy === item.intent ? 'Opening…' : item.label}
            </Button>
          ))}
        </div>
        {portalError ? <SettingsCallout>{portalError}</SettingsCallout> : null}
      </SettingsSection>

      <SettingsSection
        title="Single Sign-On"
        description="Configure SAML/OIDC connections for this organization."
      >
        <WorkOsSsoWidget />
      </SettingsSection>

      <SettingsSection
        title="Directory Sync"
        description="SCIM / Google Workspace sync for human members."
      >
        <WorkOsDirectorySyncWidget />
      </SettingsSection>

      <SettingsSection
        title="Domain verification"
        description="Verify organization domains for SSO and JIT."
      >
        <WorkOsDomainWidget />
      </SettingsSection>

      <SettingsSection
        title="Audit log streaming"
        description="Stream WorkOS security and workspace-settings events to your SIEM. Collection data-plane events stay in Kitsune."
      >
        <WorkOsAuditStreamingWidget />
      </SettingsSection>
    </div>
  );
}
