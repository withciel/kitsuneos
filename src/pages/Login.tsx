export default function Login({
  props,
}: {
  props?: {
    error?: string;
    username?: string;
  };
}) {
  const error = props?.error;
  const username = props?.username ?? '';

  return (
    <main class="min-h-screen grid place-items-center p-4">
      <div class="w-full max-w-md border border-stone-800 bg-stone-900/80 p-6">
        <h1 class="text-2xl font-semibold tracking-tight text-stone-100">
          Login
        </h1>
        <p class="mt-2 text-sm text-stone-400">
          This is only meant for the administrator to log in and manage the CDN.
          If you stumbled upon this page by accident, you can safely ignore it
          and go back to the homepage.
        </p>

        {error ? (
          <p class="mt-4 border border-red-900/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <form
          class="mt-6 space-y-5"
          method="post"
          action={`${basePath}/login`}
          autocomplete="on"
        >
          <div class="space-y-2">
            <label
              for="username"
              class="block text-sm font-medium text-stone-100"
            >
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              placeholder="admin"
              value={username}
              required
              class="w-full border border-stone-700 bg-stone-800/80 px-3 py-2.5 text-base text-stone-100 placeholder:text-stone-500 outline-none transition-colors focus:border-stone-500"
            />
          </div>

          <div class="space-y-2">
            <label
              for="password"
              class="block text-sm font-medium text-stone-100"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              class="w-full border border-stone-700 bg-stone-800/80 px-3 py-2.5 text-base text-stone-100 outline-none transition-colors focus:border-stone-500"
            />
          </div>

          <button
            type="submit"
            class="w-full bg-stone-200 py-2.5 text-base font-semibold text-stone-900 transition-colors hover:bg-white"
          >
            Login
          </button>
        </form>
      </div>
    </main>
  );
}
