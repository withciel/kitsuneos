'use client';

import { SetupChecklist } from '@/components/onboarding/setup-checklist';
import { AppSidebar } from '@/components/shell/app-sidebar';
import { CommandPalette } from '@/components/shell/command-palette';
import { ShellHeader } from '@/components/shell/shell-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import type { SidebarPrefs } from '@/lib/server/sidebar-prefs';
import {
  WorkspaceSessionProvider,
  type WorkspaceSessionSnapshot,
} from '@/lib/workspace-session';

export function WorkspaceShell({
  children,
  initialSnapshot,
  initialSidebarPrefs,
}: {
  children: React.ReactNode;
  initialSnapshot?: WorkspaceSessionSnapshot | null;
  initialSidebarPrefs?: SidebarPrefs;
}) {
  return (
    <WorkspaceSessionProvider initialSnapshot={initialSnapshot}>
      <SidebarProvider>
        <AppSidebar initialPrefs={initialSidebarPrefs} />
        <SidebarInset className="min-h-svh bg-background">
          <ShellHeader />
          <SetupChecklist />
          <div className="flex flex-1 flex-col">{children}</div>
        </SidebarInset>
        <CommandPalette />
      </SidebarProvider>
    </WorkspaceSessionProvider>
  );
}
