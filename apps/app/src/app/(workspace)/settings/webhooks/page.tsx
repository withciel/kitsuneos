'use client';

import { SettingsNav } from '@/components/settings/settings-nav';
import { WebhooksPanel } from '@/components/settings/webhooks-panel';

export default function SettingsWebhooksPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SettingsNav />
      <div className="mx-auto w-full max-w-3xl p-6">
        <WebhooksPanel />
      </div>
    </div>
  );
}
