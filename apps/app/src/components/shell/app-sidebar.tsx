'use client';

import { Bell, Plus, Settings, Table2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { CreateDatabaseDialog } from '@/components/collection/create-database-dialog';
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
}

export function AppSidebar() {
  const pathname = usePathname();
  const [collections, setCollections] = useState<SchemaCollection[]>([]);
  const [inboxCount, setInboxCount] = useState(0);

  const reload = useCallback(() => {
    void fetch('/api/schema')
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as {
          collections?: SchemaCollection[];
        };
        setCollections(body.collections ?? []);
      })
      .catch(() => undefined);

    void fetch('/api/review')
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as {
          changeSets?: unknown[];
        };
        setInboxCount(body.changeSets?.length ?? 0);
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

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
        <Link href="/" className="flex items-center gap-2 px-1">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold tracking-tight">
            K
          </div>
          <span className="text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            Kitsune<span className="text-primary">OS</span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Databases</SidebarGroupLabel>
          <CreateDatabaseDialog
            trigger={
              <SidebarGroupAction title="New database">
                <Plus />
                <span className="sr-only">New database</span>
              </SidebarGroupAction>
            }
          />
          <SidebarGroupContent>
            <SidebarMenu>
              {collections.length === 0 ? (
                <SidebarMenuItem>
                  <CreateDatabaseDialog
                    trigger={
                      <SidebarMenuButton tooltip="Create a database">
                        <Table2 />
                        <span>Create a database</span>
                      </SidebarMenuButton>
                    }
                  />
                </SidebarMenuItem>
              ) : (
                collections.map((collection) => {
                  const href = `/c/${collection.name}`;
                  const active =
                    pathname === href || pathname.startsWith(`${href}/`);
                  return (
                    <SidebarMenuItem key={collection.name}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={collection.name}
                      >
                        <Link href={href}>
                          <Table2 />
                          <span>{collection.name}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname.startsWith('/inbox')}
              tooltip="Inbox"
            >
              <Link href="/inbox">
                <Bell />
                <span>Inbox</span>
                {inboxCount > 0 ? (
                  <Badge
                    variant="default"
                    className="ml-auto h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px]"
                  >
                    {inboxCount}
                  </Badge>
                ) : null}
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
