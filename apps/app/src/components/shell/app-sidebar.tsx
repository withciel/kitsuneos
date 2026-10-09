'use client';

import {
  Bot,
  ChevronRight,
  Copy,
  ExternalLink,
  GitPullRequest,
  MoreHorizontal,
  Network,
  Plus,
  Settings,
  Star,
  StickyNote,
  Table2,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { CreateDatabaseDialog } from '@/components/collection/create-database-dialog';
import { WorkspaceSwitcher } from '@/components/shell/workspace-switcher';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
} from '@/components/ui/sidebar';
import type { SidebarFavorite, SidebarPrefs } from '@/lib/server/sidebar-prefs';
import { cn } from '@/lib/utils';
import { useWorkspaceSession } from '@/lib/workspace-session';

type SectionId = 'favorites' | 'workspace' | 'personal';

export function AppSidebar({ initialPrefs }: { initialPrefs?: SidebarPrefs }) {
  const pathname = usePathname();
  const { schema, openChangeSetCount, loading } = useWorkspaceSession();
  const [favorites, setFavorites] = useState<SidebarFavorite[]>(
    initialPrefs?.favorites ?? [],
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(initialPrefs?.collapsed ?? []),
  );

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
  const favoriteIds = useMemo(
    () => new Set(favorites.map((item) => item.id)),
    [favorites],
  );

  const persistPrefs = useCallback(
    async (nextFavorites: SidebarFavorite[], nextCollapsed: Set<string>) => {
      try {
        await fetch('/api/sidebar-prefs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            favorites: nextFavorites,
            collapsed: [...nextCollapsed],
          }),
        });
      } catch {
        // Cookie write is best-effort; UI already updated optimistically.
      }
    },
    [],
  );

  const toggleFavorite = useCallback(
    (collectionName: string) => {
      setFavorites((prev) => {
        const exists = prev.some((item) => item.id === collectionName);
        const next = exists
          ? prev.filter((item) => item.id !== collectionName)
          : [
              ...prev,
              {
                type: 'collection' as const,
                id: collectionName,
                label: collectionName,
                href: `/c/${collectionName}`,
              },
            ];
        void persistPrefs(next, collapsed);
        return next;
      });
    },
    [collapsed, persistPrefs],
  );

  const setSectionOpen = useCallback(
    (id: SectionId, open: boolean) => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (open) next.delete(id);
        else next.add(id);
        void persistPrefs(favorites, next);
        return next;
      });
    },
    [favorites, persistPrefs],
  );

  function renderDbRow(collectionName: string) {
    const href = `/c/${collectionName}`;
    const active = pathname === href || pathname.startsWith(`${href}/`);
    const Icon = collectionName === 'notes' ? StickyNote : Table2;
    const starred = favoriteIds.has(collectionName);

    return (
      <SidebarMenuItem key={collectionName}>
        <SidebarMenuButton
          asChild
          isActive={active}
          tooltip={collectionName}
          className="h-7 text-[13px]"
        >
          <Link href={href}>
            <Icon className="text-sidebar-foreground/70" />
            <span className="truncate">{collectionName}</span>
          </Link>
        </SidebarMenuButton>
        <SidebarMenuAction
          showOnHover
          title={starred ? 'Remove from favorites' : 'Add to favorites'}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleFavorite(collectionName);
          }}
          className={cn(starred && 'opacity-100 text-primary')}
        >
          <Star className={cn('size-3.5', starred && 'fill-current')} />
          <span className="sr-only">{starred ? 'Unfavorite' : 'Favorite'}</span>
        </SidebarMenuAction>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuAction showOnHover title="More" className="right-6">
              <MoreHorizontal className="size-3.5" />
              <span className="sr-only">More</span>
            </SidebarMenuAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-44">
            <DropdownMenuItem asChild>
              <Link href={href}>
                <ExternalLink className="size-3.5" />
                Open
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void navigator.clipboard.writeText(
                  `${window.location.origin}${href}`,
                );
              }}
            >
              <Copy className="size-3.5" />
              Copy link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => toggleFavorite(collectionName)}>
              <Star className="size-3.5" />
              {starred ? 'Remove favorite' : 'Add to favorites'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    );
  }

  function renderDbList(
    items: typeof workspaceDbs,
    emptyLabel: string,
    scope: 'workspace' | 'personal',
  ) {
    if (schemaLoading) {
      return ['a', 'b', 'c'].map((slot) => (
        <SidebarMenuItem key={`schema-skeleton-${scope}-${slot}`}>
          <SidebarMenuSkeleton showIcon className="h-7" />
        </SidebarMenuItem>
      ));
    }
    if (items.length === 0) {
      return (
        <SidebarMenuItem>
          <CreateDatabaseDialog
            defaultScope={scope}
            trigger={
              <SidebarMenuButton
                tooltip={emptyLabel}
                className="h-7 text-[13px]"
              >
                <Table2 className="text-sidebar-foreground/70" />
                <span>{emptyLabel}</span>
              </SidebarMenuButton>
            }
          />
        </SidebarMenuItem>
      );
    }
    return items.map((collection) => renderDbRow(collection.name));
  }

  function Section({
    id,
    label,
    children,
    action,
  }: {
    id: SectionId;
    label: string;
    children: React.ReactNode;
    action?: React.ReactNode;
  }) {
    const open = !collapsed.has(id);
    return (
      <Collapsible
        open={open}
        onOpenChange={(next) => setSectionOpen(id, next)}
        className="group/collapsible"
      >
        <SidebarGroup className="py-1">
          <div className="relative flex items-center">
            <CollapsibleTrigger asChild>
              <SidebarGroupLabel className="h-7 cursor-pointer gap-1 text-[11px] font-medium tracking-wide text-sidebar-foreground/55 hover:text-sidebar-foreground">
                <ChevronRight className="size-3 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                {label}
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            {action}
          </div>
          <CollapsibleContent>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">{children}</SidebarMenu>
            </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
      </Collapsible>
    );
  }

  const favoriteRows = favorites.filter((fav) =>
    schema
      ? schema.collections.some((collection) => collection.name === fav.id)
      : true,
  );

  return (
    <Sidebar collapsible="icon" className="border-r-sidebar-border/80">
      <SidebarHeader className="gap-2 border-b border-sidebar-border/60 px-2 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 px-1.5 transition-opacity hover:opacity-90"
        >
          <span
            aria-hidden="true"
            className="relative flex size-6 shrink-0 items-center justify-center"
          >
            <span className="absolute inset-y-0.5 left-0 w-0.5 rounded-full bg-primary" />
            <span className="pl-1.5 font-mono text-[10px] font-medium tracking-tight text-sidebar-foreground/80">
              KO
            </span>
          </span>
          <span className="text-[13px] font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            KitsuneOS
          </span>
        </Link>
        <WorkspaceSwitcher />
      </SidebarHeader>
      <SidebarContent className="gap-0 px-1">
        <Section id="favorites" label="Favorites">
          {favoriteRows.length === 0 ? (
            <SidebarMenuItem>
              <SidebarMenuButton
                disabled
                className="h-7 text-[12px] text-sidebar-foreground/45"
              >
                <Star className="text-sidebar-foreground/40" />
                <span>Hover a database → star</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : (
            favoriteRows.map((fav) => renderDbRow(fav.id))
          )}
        </Section>

        <Section
          id="workspace"
          label="Workspace"
          action={
            <CreateDatabaseDialog
              defaultScope="workspace"
              trigger={
                <SidebarGroupAction title="New workspace database">
                  <Plus />
                  <span className="sr-only">New workspace database</span>
                </SidebarGroupAction>
              }
            />
          }
        >
          {renderDbList(workspaceDbs, 'Create a database', 'workspace')}
        </Section>

        <Section
          id="personal"
          label="Personal"
          action={
            <CreateDatabaseDialog
              defaultScope="personal"
              trigger={
                <SidebarGroupAction title="New personal database">
                  <Plus />
                  <span className="sr-only">New personal database</span>
                </SidebarGroupAction>
              }
            />
          }
        >
          {renderDbList(personalDbs, 'Create personal DB', 'personal')}
        </Section>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/60">
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={
                pathname.startsWith('/changes') || pathname.startsWith('/inbox')
              }
              tooltip="Changes"
              className="h-7 text-[13px]"
            >
              <Link href="/changes">
                <GitPullRequest className="text-sidebar-foreground/70" />
                <span>Changes</span>
              </Link>
            </SidebarMenuButton>
            {changesCount > 0 ? (
              <SidebarMenuBadge className="bg-primary/15 text-primary">
                {changesCount}
              </SidebarMenuBadge>
            ) : null}
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname.startsWith('/agents')}
              tooltip="Agents"
              className="h-7 text-[13px]"
            >
              <Link href="/agents">
                <Bot className="text-sidebar-foreground/70" />
                <span>Agents</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname.startsWith('/graph')}
              tooltip="Graph"
              className="h-7 text-[13px]"
            >
              <Link href="/graph">
                <Network className="text-sidebar-foreground/70" />
                <span>Graph</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname.startsWith('/settings')}
              tooltip="Settings"
              className="h-7 text-[13px]"
            >
              <Link href="/settings">
                <Settings className="text-sidebar-foreground/70" />
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
