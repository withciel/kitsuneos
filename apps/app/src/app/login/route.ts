import { getSignInUrl } from '@workos-inc/authkit-nextjs';
import { redirect } from 'next/navigation';
import { safeReturnTo } from '@/lib/safe-return-to';

export async function GET(request: Request) {
  const url = new URL(request.url);
  // MCP OAuth (and other flows) pass returnTo so AuthKit state restores the
  // authorize URL after login instead of dumping onto the dashboard.
  const returnTo = safeReturnTo(url.searchParams.get('returnTo'), '/');
  const signInUrl = await getSignInUrl({ returnTo });
  redirect(signInUrl);
}
