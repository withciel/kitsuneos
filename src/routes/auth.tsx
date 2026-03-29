import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { authCookie, hashPassword, isLoggedIn, jwtAlg } from '@/lib/auth';
import { AppSchema } from "@/lib/appSchema";
import { Jwt } from "hono/utils/jwt";
import Login from "@/pages/Login";

export const auth = new Hono<AppSchema>();

auth.post('/login', async (c) => {
  const { ADMIN_USERNAME, ADMIN_PASSWORD, AUTH_SECRET } = c.env;
  const body = await c.req.parseBody();

  const username = typeof body.username === 'string' ? body.username : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (username === ADMIN_USERNAME) {
    const hashedPassword = await hashPassword(password);

    if (hashedPassword === ADMIN_PASSWORD) {
      const token = await Jwt.sign({ username }, AUTH_SECRET, jwtAlg);

      setCookie(c, authCookie, token, {
        httpOnly: true,
        secure: c.req.url.startsWith('https://'),
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });

      return c.redirect(`${c.env.BASE_PATH}/dashboard`);
    }
  }

  c.status(401);

  return c.render(
    <Login props={{ error: 'Invalid username or password', username }} />,
  );
});

auth.get('/login', async (c) => {
  if (await isLoggedIn(c)) {
    return c.redirect(`${c.env.BASE_PATH}/dashboard`);
  }

  return c.render(<Login />);
});

auth.get('/logout', (c) => {
  deleteCookie(c, authCookie, { path: '/' });
  return c.redirect(`${c.env.BASE_PATH}/login`);
});
