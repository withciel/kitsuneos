#!/usr/bin/env node
/**
 * Register Dodo webhook after App Runner deploy. Writes secret to AWS Secrets Manager.
 * Usage: register-dodo-webhook.mjs <webhookUrl> [pulumiStack]
 */
import { execFileSync } from 'node:child_process';
import DodoPayments from 'dodopayments';

const webhookUrl = process.argv[2];
const stack = process.argv[3] ?? 'staging';

if (!webhookUrl) {
  console.error('Usage: register-dodo-webhook.mjs <webhookUrl> [stack]');
  process.exit(1);
}

if (stack !== 'staging' && stack !== 'prod') {
  console.error('stack must be staging or prod');
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
