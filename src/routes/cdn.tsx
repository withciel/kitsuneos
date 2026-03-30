import { Hono } from 'hono';
import Cdn from '@/pages/Cdn';
import { AppSchema } from '@/lib/appSchema';

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

  console.log('Listing files with cursor:', cursor);

  while (true) {
    const response = await db.list({ cursor, limit: 1000 });

    console.log('Received response:', response);

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

export const cdn = new Hono<AppSchema>();

cdn.get('/', async (c) => {
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
        routeUrl: `${origin}${basePath ?? ''}/${encodeURIComponent(file.id)}`,
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

cdn.get('/:id', async (c) => {
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
