import { NextResponse } from 'next/server';
import {
  COLLAPSED_COOKIE,
  cookieOptions,
  FAVORITES_COOKIE,
  parseCollapsed,
  parseFavorites,
  type SidebarFavorite,
  serializeCollapsed,
  serializeFavorites,
} from '@/lib/server/sidebar-prefs';

export async function GET() {
  const { cookies } = await import('next/headers');
  const jar = await cookies();
  return NextResponse.json(
    {
      favorites: parseFavorites(jar.get(FAVORITES_COOKIE)?.value),
      collapsed: parseCollapsed(jar.get(COLLAPSED_COOKIE)?.value),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    favorites?: SidebarFavorite[];
    collapsed?: string[];
  };
  const { cookies } = await import('next/headers');
  const jar = await cookies();
  const opts = cookieOptions();

  if (Array.isArray(body.favorites)) {
    jar.set(
      FAVORITES_COOKIE,
      serializeFavorites(parseFavorites(JSON.stringify(body.favorites))),
      opts,
    );
  }
  if (Array.isArray(body.collapsed)) {
    jar.set(
      COLLAPSED_COOKIE,
      serializeCollapsed(parseCollapsed(JSON.stringify(body.collapsed))),
      opts,
    );
  }

  return NextResponse.json({
    favorites: parseFavorites(jar.get(FAVORITES_COOKIE)?.value),
    collapsed: parseCollapsed(jar.get(COLLAPSED_COOKIE)?.value),
  });
}
