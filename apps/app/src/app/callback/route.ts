import { handleAuth } from '@workos-inc/authkit-nextjs';

// App Runner listens on HOSTNAME=0.0.0.0; without baseURL, authkit builds the
// post-login redirect from the container request URL (https://0.0.0.0:8080/).
const baseURL = process.env.APP_BASE_URL;

// Default post-login landing is `/`. When sign-in was started with
// getSignInUrl({ returnTo }), AuthKit encodes that path in `state` and
// handleAuth prefers it — required for MCP OAuth authorize → Claude redirect.
export const GET = handleAuth({
  returnPathname: '/',
  ...(baseURL ? { baseURL } : {}),
});
