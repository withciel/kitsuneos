#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/pulumi-stack.sh
source "$ROOT/scripts/pulumi-stack.sh"
STACK="$(resolve_pulumi_stack "$ROOT" "${1:-}")"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
REGION="${AWS_REGION:-us-east-1}"

export PATH="/opt/homebrew/opt/libpq/bin:/opt/homebrew/bin:${PATH:-}"
# shellcheck source=scripts/aws-env.sh
source "$ROOT/scripts/aws-env.sh"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
export ENV_FILE

WORKOS_JSON=$(node -e '
const payload = {
  WORKOS_API_KEY: process.env.WORKOS_API_KEY,
  WORKOS_CLIENT_ID: process.env.WORKOS_CLIENT_ID,
  WORKOS_COOKIE_PASSWORD: process.env.WORKOS_COOKIE_PASSWORD,
  WORKOS_REDIRECT_URI: process.env.WORKOS_REDIRECT_URI,
};
for (const [key, value] of Object.entries(payload)) {
  if (!value) {
    console.error(`Missing ${key} in env file`);
    process.exit(1);
  }
}
process.stdout.write(JSON.stringify(payload));
')

DODO_JSON=$(node -e '
const payload = {
  DODO_PAYMENTS_API_KEY: process.env.DODO_PAYMENTS_API_KEY,
  DODO_PAYMENTS_ENVIRONMENT: process.env.DODO_PAYMENTS_ENVIRONMENT ?? "test_mode",
  DODO_PRODUCT_ID: process.env.DODO_PRODUCT_ID,
  BILLING_RECONCILE_SECRET: process.env.BILLING_RECONCILE_SECRET,
};
for (const [key, value] of Object.entries(payload)) {
  if (!value) {
    console.error(`Missing ${key} in env file`);
    process.exit(1);
  }
}
process.stdout.write(JSON.stringify(payload));
')

WORKOS_SECRET=$(aws secretsmanager list-secrets \
  --region "$REGION" \
  --filters Key=name,Values=workos-keys \
  --query 'SecretList[0].Name' \
  --output text)

DODO_SECRET=$(aws secretsmanager list-secrets \
  --region "$REGION" \
  --filters Key=name,Values=dodo-keys \
  --query 'SecretList[0].Name' \
  --output text)

if [[ "$WORKOS_SECRET" == "None" || -z "$WORKOS_SECRET" ]]; then
  echo "workos-keys secret not found. Run pulumi up first." >&2
  exit 1
fi

if [[ "$DODO_SECRET" == "None" || -z "$DODO_SECRET" ]]; then
  echo "dodo-keys secret not found. Run pulumi up first." >&2
  exit 1
fi

aws secretsmanager put-secret-value \
  --region "$REGION" \
  --secret-id "$WORKOS_SECRET" \
  --secret-string "$WORKOS_JSON"

aws secretsmanager put-secret-value \
  --region "$REGION" \
  --secret-id "$DODO_SECRET" \
  --secret-string "$DODO_JSON"

echo "Synced WorkOS and Dodo secrets for stack $STACK"
