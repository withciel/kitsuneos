import DodoPayments from 'dodopayments';

let client: DodoPayments | null = null;

export function getDodoClient(): DodoPayments | null {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!client) {
    client = new DodoPayments({
      bearerToken: apiKey,
      environment:
        process.env.DODO_PAYMENTS_ENVIRONMENT === 'live_mode'
          ? 'live_mode'
          : 'test_mode',
    });
  }
  return client;
}

export function mapDodoSubscriptionStatus(
  eventType: string,
  payloadStatus?: string,
): string {
  if (payloadStatus) {
    return payloadStatus.replace('subscription.', '');
  }
  const normalized = eventType.replace('subscription.', '');
  if (normalized === 'renewed') return 'active';
  if (normalized === 'cancelled') return 'cancelled';
  if (normalized === 'on_hold') return 'on_hold';
  if (normalized === 'paused') return 'paused';
  if (normalized === 'failed') return 'failed';
  if (normalized === 'expired') return 'expired';
  if (normalized === 'active') return 'active';
  return normalized;
}
