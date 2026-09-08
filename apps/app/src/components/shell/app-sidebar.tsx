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
import { useMemo } from 'react';
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
  SidebarMenuSkeleton,
  SidebarRail,
} from '@/components/ui/sidebar';
import { useWorkspaceSession } from '@/lib/workspace-session';

export function AppSidebar() {
  const pathname = usePathname();
  const { schema, openChangeSetCount, loading } = useWorkspaceSession();

  const { workspaceDbs, personalDbs } = useMemo(() => {
    const next = schema?.collections ?? [];
    return {
      workspaceDbs: next.filter(
        (collection) => (collection.scope ?? 'workspace') !== 'personal',
      ),
      personalDbs: next.filter((collection) => collection.scope === 'personal'),
    };
  }, [schema]);

  const schemaLoading = loading && !schema;
  const changesCount = openChangeSetCount;

  function renderDbList(
    items: typeof workspaceDbs,
    emptyLabel: string,
    scope: 'workspace' | 'personal',
  ) {
    if (schemaLoading) {
      return ['a', 'b', 'c'].map((slot) => (
        <SidebarMenuItem key={`schema-skeleton-${scope}-${slot}`}>
          <SidebarMenuSkeleton showIcon />
        </SidebarMenuItem>
      ));
    }
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
          <SidebarMenuButton
            asChild
            isActive={active}
            tooltip={collection.name}
          >
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
        <Link
          href="/"
          className="mb-2 flex items-center gap-2.5 px-1 transition-opacity hover:opacity-90"
        >
          <span
            aria-hidden="true"
            className="relative flex size-7 shrink-0 items-center justify-center"
          >
            <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary" />
            <span className="pl-1.5 font-mono text-[11px] font-medium tracking-tight text-sidebar-foreground">
              KO
            </span>
          </span>
          <span className="text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            KitsuneOS
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
