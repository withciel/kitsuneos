'use client';

import { BillingPanel } from '@/components/settings/billing-panel';
import { SettingsNav } from '@/components/settings/settings-nav';

export default function SettingsBillingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SettingsNav />
      <div className="mx-auto w-full max-w-3xl p-6">
        <BillingPanel />
      </div>
    </div>
  );
}
