import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { requestId } from 'hono/request-id';
import { trimTrailingSlash } from 'hono/trailing-slash';
import { renderer } from './renderer';
import { AppSchema } from './lib/appSchema';
import { cache } from 'hono/cache';
import { auth } from './routes/auth';
import { dashboard } from './routes/dashboard';
import { cdn } from './routes/cdn';
import { env } from 'cloudflare:workers';

const app = new Hono<AppSchema>().basePath(env.BASE_PATH ?? '');

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

app.route('/', auth);
app.route('/', dashboard);
app.route('/', cdn);

export default app;
