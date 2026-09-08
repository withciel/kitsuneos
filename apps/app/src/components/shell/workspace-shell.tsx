'use client';

import { SetupChecklist } from '@/components/onboarding/setup-checklist';
import { AppSidebar } from '@/components/shell/app-sidebar';
import { CommandPalette } from '@/components/shell/command-palette';
import { ShellHeader } from '@/components/shell/shell-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-h-svh bg-background">
        <ShellHeader />
        <SetupChecklist />
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
      <CommandPalette />
    </SidebarProvider>
  );
}
