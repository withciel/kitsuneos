import { getWorkOS, isWorkOSConfigured } from './client.js';

export type WorkOSWebhookEvent = {
  event: string;
  id: string;
  data: Record<string, unknown>;
  createdAt: string;
};

/**
 * Verify and parse a WorkOS webhook payload.
 * Returns null when signature verification fails or WorkOS is not configured.
 */
export async function constructWorkOSWebhookEvent(
  payload: string,
  signatureHeader: string,
  secret: string,
): Promise<WorkOSWebhookEvent | null> {
  if (!isWorkOSConfigured()) return null;
  const workos = getWorkOS();
  if (!workos) return null;
  try {
    const event = await workos.webhooks.constructEvent({
      payload,
      sigHeader: signatureHeader,
      secret,
    });
    return {
      event: event.event,
      id: event.id,
      data: event.data as Record<string, unknown>,
      createdAt: String(event.createdAt),
    };
  } catch (error) {
    console.warn(
      '[workos] webhook verification failed:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
