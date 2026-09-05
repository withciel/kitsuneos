import { getSignUpUrl } from '@workos-inc/authkit-nextjs';
import { redirect } from 'next/navigation';

export async function GET() {
  const url = await getSignUpUrl();
  redirect(url);
}
