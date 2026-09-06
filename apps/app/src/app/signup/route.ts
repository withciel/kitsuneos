import { getSignUpUrl } from '@workos-inc/authkit-nextjs';
import { redirect } from 'next/navigation';
import { safeReturnTo } from '@/lib/safe-return-to';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get('returnTo'), '/');
  const signUpUrl = await getSignUpUrl({ returnTo });
  redirect(signUpUrl);
}
