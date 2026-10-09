'use client';

import { SettingsNav } from '@/components/settings/settings-nav';
import {
  SettingsPageHeader,
  SettingsSection,
} from '@/components/settings/settings-section';
import { WorkOsSecurityWidget } from '@/components/settings/workos/workos-widgets';

export default function SettingsSecurityPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-8">
      <SettingsPageHeader
        title="Security"
        description="Password and multi-factor authentication via WorkOS AuthKit."
      />
      <SettingsNav />
      <SettingsSection
        title="Account security"
        description="MFA enrollment, password changes, and session-related security controls."
      >
        <WorkOsSecurityWidget />
      </SettingsSection>
    </div>
  );
}
