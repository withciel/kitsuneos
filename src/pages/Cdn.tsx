import { Script } from 'vite-ssr-components/hono';

interface CdnMediaItem {
  id: string;
  sourceUrl: string;
  routeUrl: string;
  kind: 'image' | 'video';
}

interface CdnFileItem {
  id: string;
  sourceUrl: string;
  routeUrl: string;
}

export default function Cdn({
  props: { mediaItems, fileItems },
}: {
  props: {
    mediaItems: CdnMediaItem[];
    fileItems: CdnFileItem[];
  };
}) {
  return (
    <main class="min-h-screen p-4 sm:p-6">
      <div class="mx-auto w-full max-w-6xl">
        <div class="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 class="text-2xl font-semibold tracking-tight text-stone-100">
              CDN Files
            </h1>
            <p class="mt-2 text-sm text-stone-400">
              Click any preview to copy its CDN URL.
            </p>
          </div>
          <a
            href="/login"
            class="text-sm text-stone-300 underline-offset-4 transition-colors hover:text-stone-100 hover:underline"
          >
            Admin login
          </a>
        </div>

        {mediaItems.length ? (
          <section class="columns-1 gap-4 sm:columns-2 lg:columns-3">
            {mediaItems.map((item) => (
              <button
                type="button"
                data-copy-url={item.routeUrl}
                class="group relative mb-4 block w-full break-inside-avoid cursor-pointer overflow-hidden border border-stone-800 bg-stone-900 text-left outline-none transition-colors hover:border-stone-600 focus-visible:border-stone-500"
              >
                {item.kind === 'image' ? (
                  <img
                    src={item.sourceUrl}
                    alt={item.id}
                    loading="lazy"
                    class="h-auto w-full cursor-pointer object-cover transition-transform duration-200 group-hover:scale-[1.01]"
                  />
                ) : (
                  <video
                    src={item.sourceUrl}
                    preload="metadata"
                    muted
                    playsInline
                    class="h-auto w-full cursor-pointer object-cover transition-transform duration-200 group-hover:scale-[1.01]"
                  />
                )}
                <div class="pointer-events-none absolute inset-0 grid place-items-center bg-stone-950/85 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <span class="inline-flex rounded-full border border-stone-700 bg-stone-950/95 px-3 py-1 font-mono text-sm text-stone-100">
                    {item.id}
                  </span>
                </div>
              </button>
            ))}
          </section>
        ) : (
          <p class="border border-stone-800 bg-stone-900/80 px-4 py-3 text-sm text-stone-400">
            No image or video files found yet.
          </p>
        )}

        <section class="mt-8">
          <h2 class="text-lg font-semibold text-stone-100">Other files</h2>
          {fileItems.length ? (
            <ul class="mt-3 space-y-2">
              {fileItems.map((item) => (
                <li class="flex items-center justify-between gap-3 border border-stone-800 bg-stone-900/80 px-3 py-2">
                  <span class="font-mono text-sm text-stone-100">
                    {item.id}
                  </span>
                  <button
                    type="button"
                    data-copy-url={item.routeUrl}
                    class="text-sm text-stone-300 underline-offset-4 transition-colors hover:text-stone-100 hover:underline"
                  >
                    Copy URL
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p class="mt-3 text-sm text-stone-500">No non-media files.</p>
          )}
        </section>
      </div>

      <div
        id="copy-toast"
        class="pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2 border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-100 opacity-0 transition-opacity"
      >
        URL copied to clipboard
      </div>
      <Script src="/src/client/cdn.ts" />
    </main>
  );
}
