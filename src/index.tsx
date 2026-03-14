import { type Context, Hono } from 'hono';
// import { cache } from 'hono/cache';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { JwtVariables } from 'hono/jwt';
import { jwt } from 'hono/jwt';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { requestId } from 'hono/request-id';
import { trimTrailingSlash } from 'hono/trailing-slash';
import { Jwt } from 'hono/utils/jwt';
import { hashPassword } from './lib/auth';
import { storageStats, upload } from './lib/storage';
import Cdn from './pages/Cdn';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import { renderer } from './renderer';

interface Bindings extends CloudflareBindings {
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
  AUTH_SECRET: string;
}

const app = new Hono<{ Bindings: Bindings; Variables: JwtVariables }>();

const fallbackStats = {
  usedBytes: 0,
  limitBytes: 1,
  usedPercent: 0,
};

function kindFromContentType(contentType: string | null) {
  const value = (contentType ?? '').toLowerCase();

  if (value.startsWith('image/')) {
    return 'image' as const;
  }

  if (value.startsWith('video/')) {
    return 'video' as const;
  }

  return 'other' as const;
}

function kindFromUrl(url: string) {
  const cleanUrl = url.split('?')[0]?.toLowerCase() ?? '';

  if (/(\.png|\.jpg|\.jpeg|\.gif|\.webp|\.avif|\.svg)$/.test(cleanUrl)) {
    return 'image' as const;
  }

  if (/(\.mp4|\.webm|\.mov|\.m4v|\.ogg)$/.test(cleanUrl)) {
    return 'video' as const;
  }

  return 'other' as const;
}

async function listAllFiles(db: KVNamespace) {
  const files: Array<{ id: string; sourceUrl: string }> = [];
  let cursor: string | undefined;

  while (true) {
    const response = await db.list({ cursor, limit: 1000 });

    const values = await Promise.all(
      response.keys.map(async (key) => {
        const value = await db.get(key.name);
        if (!value) {
          return null;
        }

        return { id: key.name, sourceUrl: value };
      }),
    );

    files.push(
      ...values.filter(
        (value): value is { id: string; sourceUrl: string } => value !== null,
      ),
    );

    if (response.list_complete) {
      break;
    }

    cursor = response.cursor;
  }

  return files;
}

async function renderDashboard(
  c: Context<{ Bindings: Bindings; Variables: JwtVariables }>,
  options?: { error?: string; idValue?: string; status?: 400 | 401 | 500 },
) {
  const stats = await storageStats(c.env.STORAGE_KEY).catch(
    () => fallbackStats,
  );

  if (options?.status) {
    c.status(options.status);
  }

  return c.render(
    <Dashboard
      props={{
        storageUsed: stats.usedPercent,
        storageUsedBytes: stats.usedBytes,
        storageLimitBytes: stats.limitBytes,
        error: options?.error,
        idValue: options?.idValue,
      }}
    />,
  );
}

async function isLoggedIn(
  c: Context<{ Bindings: Bindings; Variables: JwtVariables }>,
) {
  const token = getCookie(c, 'kitsune_auth_token');
  if (!token) {
    return false;
  }

  return Jwt.verify(token, c.env.AUTH_SECRET, 'HS256')
    .then(() => true)
    .catch(() => false);
}

async function renderLogin(
  c: Context<{ Bindings: Bindings; Variables: JwtVariables }>,
) {
  const loggedIn = await isLoggedIn(c);

  if (loggedIn) {
    return c.redirect('/cdn/dashboard');
  }

  return c.render(<Login />);
}

async function handleLogin(
  c: Context<{ Bindings: Bindings; Variables: JwtVariables }>,
) {
  const { ADMIN_USERNAME, ADMIN_PASSWORD, AUTH_SECRET } = c.env;
  const body = await c.req.parseBody();

  const username = typeof body.username === 'string' ? body.username : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (username === ADMIN_USERNAME) {
    const hashedPassword = await hashPassword(password);

    if (hashedPassword === ADMIN_PASSWORD) {
      const token = await Jwt.sign({ username }, AUTH_SECRET, 'HS256');
      setCookie(c, 'kitsune_auth_token', token, {
        httpOnly: true,
        secure: c.req.url.startsWith('https://'),
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });

      return c.redirect('/cdn/dashboard');
    }
  }

  c.status(401);
  return c.render(
    <Login props={{ error: 'Invalid username or password', username }} />,
  );
}

/**
 * Middleware
 */
app.use(logger());
app.use(prettyJSON());
app.use(requestId());
app.use(trimTrailingSlash());
app.use(renderer);
// app.get(
//   '*',
//   cache({
//     cacheName: 'kitsune-cache',
//     cacheControl: 'public, max-age=86400',
//     cacheableStatusCodes: [200],
//   }),
// );

/**
 * Auth Middleware
 */

const authMiddleware = (
  c: Context<{ Bindings: Bindings; Variables: JwtVariables }>,
) => {
  return jwt({
    secret: c.env.AUTH_SECRET,
    alg: 'HS256',
    cookie: 'kitsune_auth_token',
  });
};

app.use('/cdn/api/*', (c, next) => authMiddleware(c)(c, next));
app.use('/cdn/dashboard', (c, next) => authMiddleware(c)(c, next));
app.use('/dashboard', (c, next) => authMiddleware(c)(c, next));

/**
 * Authentication Routes
 */

app.post('/cdn/login', handleLogin);

app.get('/cdn/login', renderLogin);

app.get('/cdn/dashboard', async (c) => {
  return renderDashboard(c);
});

app.get('/cdn/logout', (c) => {
  deleteCookie(c, 'kitsune_auth_token', { path: '/' });
  return c.redirect('/cdn/login');
});

app.get('/cdn', async (c) => {
  const origin = new URL(c.req.url).origin;
  const files = await listAllFiles(c.env.db);

  const classifiedFiles = await Promise.all(
    files.map(async (file) => {
      let kind = kindFromUrl(file.sourceUrl);

      if (kind === 'other') {
        kind = await fetch(file.sourceUrl, { method: 'HEAD' })
          .then((response) =>
            kindFromContentType(response.headers.get('content-type')),
          )
          .catch(() => 'other');
      }

      return {
        ...file,
        kind,
        routeUrl: `${origin}/cdn/${encodeURIComponent(file.id)}`,
      };
    }),
  );

  classifiedFiles.sort((a, b) => a.id.localeCompare(b.id));

  return c.render(
    <Cdn
      props={{
        mediaItems: classifiedFiles
          .filter((file) => file.kind === 'image' || file.kind === 'video')
          .map((file) => ({
            ...file,
            kind: file.kind as 'image' | 'video',
          })),
        fileItems: classifiedFiles.filter((file) => file.kind === 'other'),
      }}
    />,
  );
});

/**
 * CDN API Routes
 */

app.post('/cdn/api/upload', async (c) => {
  const body = await c.req.parseBody();
  const id = typeof body.id === 'string' ? body.id : '';
  const file = body.file as File;

  if (!id.trim()) {
    return renderDashboard(c, {
      error: 'Please provide an ID for this file.',
      idValue: id,
      status: 400,
    });
  }

  if (!file) {
    return renderDashboard(c, {
      error: 'Please choose a file before uploading.',
      idValue: id,
      status: 400,
    });
  }

  const stats = await storageStats(c.env.STORAGE_KEY).catch(
    () => fallbackStats,
  );
  if (stats.usedBytes + file.size > stats.limitBytes) {
    return renderDashboard(c, {
      error: 'Upload exceeds your remaining storage quota.',
      idValue: id,
      status: 400,
    });
  }

  const response = await upload(c.env.STORAGE_KEY, file).catch(() => null);

  if (!response?.url) {
    return renderDashboard(c, {
      error: 'Failed to upload file. Please try again.',
      idValue: id,
      status: 500,
    });
  }

  await c.env.db.put(id.trim(), response.url);

  return c.redirect('/cdn');
});

app.get('/cdn/:id', async (c) => {
  const id = c.req.param('id');
  const sourceUrl = await c.env.db.get(id);

  if (!sourceUrl) {
    return c.text('File not found', 404);
  }

  const upstream = await fetch(sourceUrl).catch(() => null);
  if (!upstream) {
    return c.text('Failed to fetch file', 502);
  }

  const headers = new Headers(upstream.headers);
  headers.set('x-kitsune-id', id);

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
});

export default app;
