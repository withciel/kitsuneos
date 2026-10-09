import { cookies } from 'next/headers';

export const FAVORITES_COOKIE = 'kitsune_sidebar_favorites';
export const COLLAPSED_COOKIE = 'kitsune_sidebar_collapsed';

export type SidebarFavorite = {
  type: 'collection';
  id: string;
  label?: string;
  href: string;
};

export type SidebarPrefs = {
  favorites: SidebarFavorite[];
  collapsed: string[];
};

const MAX_FAVORITES = 40;

function safeJsonParse(raw: string | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function parseFavorites(raw: string | undefined): SidebarFavorite[] {
  const parsed = safeJsonParse(raw);
  if (!Array.isArray(parsed)) return [];
  const out: SidebarFavorite[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (row.type !== 'collection') continue;
    if (typeof row.id !== 'string' || !row.id.trim()) continue;
    const id = row.id.trim();
    const href =
      typeof row.href === 'string' && row.href.startsWith('/')
        ? row.href
        : `/c/${id}`;
    out.push({
      type: 'collection',
      id,
      href,
      ...(typeof row.label === 'string' ? { label: row.label } : {}),
    });
    if (out.length >= MAX_FAVORITES) break;
  }
  return out;
}

export function parseCollapsed(raw: string | undefined): string[] {
  const parsed = safeJsonParse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (item): item is string => typeof item === 'string' && item.length > 0,
    )
    .slice(0, 20);
}

export function serializeFavorites(favorites: SidebarFavorite[]): string {
  return JSON.stringify(favorites.slice(0, MAX_FAVORITES));
}

export function serializeCollapsed(collapsed: string[]): string {
  return JSON.stringify([...new Set(collapsed)].slice(0, 20));
}

export async function readSidebarPrefs(): Promise<SidebarPrefs> {
  const jar = await cookies();
  return {
    favorites: parseFavorites(jar.get(FAVORITES_COOKIE)?.value),
    collapsed: parseCollapsed(jar.get(COLLAPSED_COOKIE)?.value),
  };
}

export function cookieOptions() {
  return {
    path: '/',
    sameSite: 'lax' as const,
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
  };
}
