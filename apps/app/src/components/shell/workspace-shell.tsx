'use client';

import { SetupChecklist } from '@/components/onboarding/setup-checklist';
import { AppSidebar } from '@/components/shell/app-sidebar';
import { CommandPalette } from '@/components/shell/command-palette';
import { Separator } from '@/components/ui/separator';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { openCommandPalette } from '@/lib/workspace-events';

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-h-svh bg-background">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <span className="text-xs text-muted-foreground">Workspace</span>
          <button
            type="button"
            className="ml-auto hidden items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground sm:inline-flex"
            onClick={() => openCommandPalette()}
          >
            Search
            <kbd className="rounded border border-border px-1 text-[10px]">
              ⌘K
            </kbd>
          </button>
        </header>
        <SetupChecklist />
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
      <CommandPalette />
    </SidebarProvider>
  );
}
