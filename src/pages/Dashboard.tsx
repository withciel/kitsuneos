import { Script } from 'vite-ssr-components/hono';

export default function Dashboard({
  props: { storageUsed, storageUsedBytes, storageLimitBytes, error, idValue },
}: {
  props: {
    storageUsed: number;
    storageUsedBytes: number;
    storageLimitBytes: number;
    error?: string;
    idValue?: string;
  };
}) {
  const normalizedUsage = Number.isFinite(storageUsed)
    ? Math.max(0, Math.min(100, storageUsed))
    : 0;
  const safeUsedBytes = Number.isFinite(storageUsedBytes)
    ? Math.max(0, storageUsedBytes)
    : 0;
  const safeLimitBytes =
    Number.isFinite(storageLimitBytes) && storageLimitBytes > 0
      ? storageLimitBytes
      : 1;

  const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes < 0) {
      return '0 B';
    }

    if (bytes < 1024) {
      return `${bytes} B`;
    }

    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    return `${value.toFixed(2)} ${units[unitIndex]}`;
  };

  return (
    <main class="min-h-screen grid place-items-center p-4">
      <div class="w-full max-w-2xl border border-stone-800 bg-stone-900/80 p-6">
        <div class="flex items-start justify-between gap-4">
          <h1 class="text-2xl font-semibold tracking-tight text-stone-100">
            Dashboard
          </h1>
          <a
            href="/logout"
            class="inline-block border border-stone-700 px-3 py-1.5 text-sm text-stone-200 transition-colors hover:border-stone-500 hover:bg-stone-800"
          >
            Logout
          </a>
        </div>
        <p class="mt-2 text-sm text-stone-400">
          Upload a file and assign a short ID to publish it at your CDN route.
        </p>

        {error ? (
          <p class="mt-4 border border-red-900/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <section class="mt-6 space-y-2">
          <div class="flex items-center justify-between text-sm text-stone-300">
            <span>Storage usage</span>
            <span>{normalizedUsage.toFixed(2)}%</span>
          </div>
          <div class="h-2 w-full bg-stone-800">
            <div
              class="h-2 bg-stone-200 transition-[width] duration-300"
              style={{ width: `${normalizedUsage}%` }}
            />
          </div>
          <p class="text-xs text-stone-500">
            {formatBytes(safeUsedBytes)} used of {formatBytes(safeLimitBytes)}
          </p>
        </section>

        <form
          class="mt-8 space-y-5"
          method="post"
          action="/cdn/api/upload"
          encType="multipart/form-data"
        >
          <div class="space-y-2">
            <label for="id" class="block text-sm font-medium text-stone-100">
              File ID
            </label>
            <input
              id="id"
              name="id"
              type="text"
              placeholder="logo"
              value={idValue ?? ''}
              required
              class="w-full border border-stone-700 bg-stone-800/80 px-3 py-2.5 text-base text-stone-100 placeholder:text-stone-500 outline-none transition-colors focus:border-stone-500"
            />
          </div>

          <div class="space-y-2">
            <label for="file" class="block text-sm font-medium text-stone-100">
              File
            </label>
            <input
              id="file"
              name="file"
              type="file"
              required
              class="w-full border border-stone-700 bg-stone-800/80 px-3 py-2.5 text-base text-stone-100 outline-none transition-colors focus:border-stone-500 file:mr-4 file:border-0 file:bg-stone-200 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-stone-900"
            />
          </div>

          <section
            id="selected-file-details"
            data-storage-used-bytes={String(safeUsedBytes)}
            data-storage-limit-bytes={String(safeLimitBytes)}
            class="hidden border border-stone-800 bg-stone-950/70 p-3"
          >
            <p class="text-sm text-stone-300">
              Filename:{' '}
              <span id="selected-file-name" class="font-mono text-stone-100" />
            </p>
            <p class="mt-1 text-sm text-stone-300">
              Size: <span id="selected-file-size" class="text-stone-100" />
            </p>
            <p class="mt-1 text-sm text-stone-300">
              Storage left after upload:{' '}
              <span id="storage-left-after-upload" class="text-stone-100" />
            </p>
          </section>

          <button
            type="submit"
            class="w-full bg-stone-200 py-2.5 text-base font-semibold text-stone-900 transition-colors hover:bg-white"
          >
            Upload
          </button>
        </form>

        <a
          href="/cdn"
          class="mt-4 inline-block text-sm text-stone-300 underline-offset-4 transition-colors hover:text-stone-100 hover:underline"
        >
          View all files
        </a>
      </div>

      <Script src="/src/client/dashboard.ts" />
    </main>
  );
}
