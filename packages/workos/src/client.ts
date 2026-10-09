import { WorkOS } from '@workos-inc/node';

let shared: WorkOS | null | undefined;

/**
 * Shared WorkOS SDK client. Returns null when WORKOS_API_KEY is unset
 * (local demo / acceptance without WorkOS).
 */
export function getWorkOS(): WorkOS | null {
  if (shared !== undefined) return shared;
  const apiKey = process.env.WORKOS_API_KEY?.trim();
  if (!apiKey) {
    shared = null;
    return shared;
  }
  const clientId = process.env.WORKOS_CLIENT_ID?.trim();
  shared = new WorkOS(apiKey, clientId ? { clientId } : undefined);
  return shared;
}

/** Test helper: clear the singleton. */
export function resetWorkOSClient(): void {
  shared = undefined;
}

export function isWorkOSConfigured(): boolean {
  return Boolean(process.env.WORKOS_API_KEY?.trim());
}
