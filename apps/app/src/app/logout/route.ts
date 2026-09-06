import { signOut } from '@workos-inc/authkit-nextjs';

export async function GET() {
  // Clears the AuthKit session and returns to the marketing site.
  const returnTo =
    process.env.NEXT_PUBLIC_SITE_ORIGIN?.trim() || 'https://kitsuneos.com';
  return signOut({ returnTo });
}
