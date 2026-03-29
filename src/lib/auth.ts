import { Context, Next } from "hono";
import { AppSchema } from "./appSchema";
import { getCookie } from "hono/cookie";
import { Jwt } from "hono/utils/jwt";
import { jwt } from "hono/jwt";

export const authCookie = 'kitsune_auth_token';
export const jwtAlg = 'HS256' as const;
export const apiAuthorizationHeaderName = 'Authorization'
export const apiAuthorizationHeaderValuePrefix = 'Bearer '

const encoder = new TextEncoder();

export async function hashPassword(password: string) {
  const data = encoder.encode(password);
  const hash = crypto.subtle.digest('SHA-256', data);

  return hash.then((buffer) => {
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  });
}

export async function isLoggedIn(c: Context<AppSchema>) {
  const token = getCookie(c, authCookie);

  if (!token) {
    return false;
  }

  return Jwt.verify(token, c.env.AUTH_SECRET, jwtAlg)
    .then(() => true)
    .catch(() => false);
}

function authMiddlewareHelper(
  c: Context<AppSchema>,
) {
  const apiAuthorizationHeader = c.req.header(apiAuthorizationHeaderName)

  if (
    apiAuthorizationHeader &&
    apiAuthorizationHeader.startsWith(apiAuthorizationHeaderValuePrefix) &&
    apiAuthorizationHeader.replace(apiAuthorizationHeaderValuePrefix, '')
    === c.env.ADMIN_API_KEY) {
    return (_: any, next: Next) => next();
  }

  return jwt({
    secret: c.env.AUTH_SECRET,
    alg: jwtAlg,
    cookie: authCookie,
  });
};

export const authMiddleware = (c: Context<AppSchema>, next: Next) =>
  authMiddlewareHelper(c)(c, next)
