'use client';

import { Bot, ShieldCheck, Users } from 'lucide-react';
import { SettingsNav } from '@/components/settings/settings-nav';
import {
  SettingsCallout,
  SettingsPageHeader,
  SettingsSection,
} from '@/components/settings/settings-section';
import { WorkOsPeopleWidget } from '@/components/settings/workos/workos-widgets';

export default function SettingsPeoplePage() {
  return (
    <div className="flex flex-1 flex-col">
      <SettingsNav />
      <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
        <SettingsPageHeader
          icon={Users}
          title="People"
          description="Invites, roles, and membership are managed by WorkOS. Kitsune mirrors principals for grants."
        />

        <SettingsSection
          icon={Users}
          title="Organization members"
          description="WorkOS User Management — invite by email, assign owner/admin/member roles, remove members."
        >
          <WorkOsPeopleWidget />
        </SettingsSection>

        <SettingsCallout icon={ShieldCheck}>
          Field-level database access still lives under{' '}
          <a href="/settings/access" className="text-primary underline">
            Access
          </a>
          . WorkOS roles control who can manage people, SSO, and agents.
        </SettingsCallout>
        <SettingsCallout icon={Bot}>
          AI agents are WorkOS Agent Auth principals — create them on{' '}
          <a href="/agents" className="text-primary underline">
            Agents
          </a>
          .
        </SettingsCallout>
      </div>
    </div>
  );
}
