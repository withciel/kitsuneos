import { handleAuth } from '@workos-inc/authkit-nextjs';

// App Runner listens on HOSTNAME=0.0.0.0; without baseURL, authkit builds the
// post-login redirect from the container request URL (https://0.0.0.0:8080/).
const baseURL = process.env.APP_BASE_URL;

export const GET = handleAuth({
  returnPathname: '/',
  ...(baseURL ? { baseURL } : {}),
});
