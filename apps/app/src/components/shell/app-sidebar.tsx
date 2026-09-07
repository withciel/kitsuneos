'use client';

import {
  Bot,
  GitPullRequest,
  Network,
  Plus,
  Settings,
  StickyNote,
  Table2,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { CreateDatabaseDialog } from '@/components/collection/create-database-dialog';
import { WorkspaceSwitcher } from '@/components/shell/workspace-switcher';
import { Badge } from '@/components/ui/badge';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { WORKSPACE_CHANGED_EVENT } from '@/lib/workspace-events';

interface SchemaCollection {
  name: string;
  capability: string;
  scope?: 'workspace' | 'personal';
}

export function AppSidebar() {
  const pathname = usePathname();
  const [workspaceDbs, setWorkspaceDbs] = useState<SchemaCollection[]>([]);
  const [personalDbs, setPersonalDbs] = useState<SchemaCollection[]>([]);
  const [changesCount, setChangesCount] = useState(0);

  const reload = useCallback(() => {
    void fetch('/api/schema')
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as {
          collections?: SchemaCollection[];
        };
        const next = body.collections ?? [];
        setWorkspaceDbs(
          next.filter((collection) => (collection.scope ?? 'workspace') !== 'personal'),
        );
        setPersonalDbs(
          next.filter((collection) => collection.scope === 'personal'),
        );
      })
      .catch(() => undefined);

    void fetch('/api/review')
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as {
          changeSets?: unknown[];
        };
        setChangesCount(body.changeSets?.length ?? 0);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    window.addEventListener(WORKSPACE_CHANGED_EVENT, reload);
    return () => {
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, reload);
    };
  }, [reload]);

  useEffect(() => {
    if (!pathname) return;
    reload();
  }, [pathname, reload]);

  function renderDbList(
    items: SchemaCollection[],
    emptyLabel: string,
    scope: 'workspace' | 'personal',
  ) {
    if (items.length === 0) {
      return (
        <SidebarMenuItem>
          <CreateDatabaseDialog
            defaultScope={scope}
            trigger={
              <SidebarMenuButton tooltip={emptyLabel}>
                <Table2 />
                <span>{emptyLabel}</span>
              </SidebarMenuButton>
            }
          />
        </SidebarMenuItem>
      );
    }
    return items.map((collection) => {
      const href = `/c/${collection.name}`;
      const active = pathname === href || pathname.startsWith(`${href}/`);
      const Icon = collection.name === 'notes' ? StickyNote : Table2;
      return (
        <SidebarMenuItem key={collection.name}>
          <SidebarMenuButton asChild isActive={active} tooltip={collection.name}>
            <Link href={href}>
              <Icon />
              <span>{collection.name}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    });
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
        <Link href="/" className="mb-2 flex items-center gap-2 px-1">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold tracking-tight">
            K
          </div>
          <span className="text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            Kitsune<span className="text-primary">OS</span>
          </span>
        </Link>
        <WorkspaceSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <CreateDatabaseDialog
            defaultScope="workspace"
            trigger={
              <SidebarGroupAction title="New workspace database">
                <Plus />
                <span className="sr-only">New workspace database</span>
              </SidebarGroupAction>
            }
          />
          <SidebarGroupContent>
            <SidebarMenu>
              {renderDbList(workspaceDbs, 'Create a database', 'workspace')}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Personal</SidebarGroupLabel>
          <CreateDatabaseDialog
            defaultScope="personal"
            trigger={
              <SidebarGroupAction title="New personal database">
                <Plus />
                <span className="sr-only">New personal database</span>
              </SidebarGroupAction>
            }
          />
          <SidebarGroupContent>
            <SidebarMenu>
              {renderDbList(personalDbs, 'Create personal DB', 'personal')}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={
                pathname.startsWith('/changes') || pathname.startsWith('/inbox')
              }
              tooltip="Changes"
            >
              <Link href="/changes">
                <GitPullRequest />
                <span>Changes</span>
                {changesCount > 0 ? (
                  <Badge
                    variant="default"
                    className="ml-auto h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px]"
                  >
                    {changesCount}
                  </Badge>
                ) : null}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname.startsWith('/agents')}
              tooltip="Agents"
            >
              <Link href="/agents">
                <Bot />
                <span>Agents</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname.startsWith('/graph')}
              tooltip="Graph"
            >
              <Link href="/graph">
                <Network />
                <span>Graph</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname.startsWith('/settings')}
              tooltip="Settings"
            >
              <Link href="/settings">
                <Settings />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
