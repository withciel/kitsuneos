#!/usr/bin/env node
/**
 * Register Dodo webhook after App Runner deploy. Writes secret to AWS Secrets Manager.
 * Usage: register-dodo-webhook.mjs <webhookUrl> [pulumiStack]
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// This script lives at repo root, but `dodopayments` is installed under apps/app.
// Resolve it relative to apps/app so Node can find the dependency in pnpm setups.
const requireFromAppsApp = createRequire(
  fileURLToPath(new URL('../apps/app/package.json', import.meta.url)),
);
const DodoPaymentsModule = requireFromAppsApp('dodopayments');
const DodoPayments =
  DodoPaymentsModule?.default ??
  DodoPaymentsModule?.DodoPayments ??
  DodoPaymentsModule;

const webhookUrl = process.argv[2];
const stack = process.argv[3] ?? 'kitsuneos';

if (!webhookUrl) {
  console.error('Usage: register-dodo-webhook.mjs <webhookUrl> [stack]');
  process.exit(1);
}

const apiKey = process.env.DODO_PAYMENTS_API_KEY;
if (!apiKey) {
  console.log('DODO_PAYMENTS_API_KEY not set; skipping webhook registration');
  process.exit(0);
}

const client = new DodoPayments({
  bearerToken: apiKey,
  environment:
    process.env.DODO_PAYMENTS_ENVIRONMENT === 'live_mode'
      ? 'live_mode'
      : 'test_mode',
});

const idempotencyKey = `kitsuneos-${stack}-billing-webhook`;
const webhook = await client.webhooks.create({
  url: webhookUrl,
  filter_types: [
    'subscription.active',
    'subscription.updated',
    'subscription.on_hold',
    'subscription.paused',
    'subscription.renewed',
    'subscription.cancelled',
    'subscription.failed',
    'subscription.expired',
  ],
  idempotency_key: idempotencyKey,
});

const secret = await client.webhooks.retrieveSecret(webhook.webhook_id);
const secretArn = execFileSync(
  'pulumi',
  ['stack', 'output', 'dodoWebhookSecretArn', '-s', stack],
  { cwd: 'infra', encoding: 'utf8' },
).trim();

execFileSync(
  'aws',
  [
    'secretsmanager',
    'put-secret-value',
    '--secret-id',
    secretArn,
    '--secret-string',
    secret.secret,
  ],
  { stdio: 'inherit' },
);

console.log(`Registered webhook ${webhook.webhook_id} -> ${webhookUrl}`);
