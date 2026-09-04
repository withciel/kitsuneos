#!/usr/bin/env bash
# Deploy marketing site to AWS S3 + CloudFront (static export from apps/site).
# Requires: AWS credentials, Pulumi stack with deploySiteCdn=true, Route 53 zone.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/pulumi-stack.sh
source "$ROOT/scripts/pulumi-stack.sh"
STACK="$(resolve_pulumi_stack "$ROOT" "${1:-}")"
REGION="${AWS_REGION:-us-east-1}"

export PATH="/opt/homebrew/opt/libpq/bin:/opt/homebrew/bin:${PATH:-}"
# shellcheck source=scripts/aws-env.sh
source "$ROOT/scripts/aws-env.sh"

cd "$ROOT"
pnpm --filter @kitsuneos/site build

if [[ ! -d "$ROOT/apps/site/out" ]]; then
  echo "Missing apps/site/out — build failed." >&2
  exit 1
fi

cd "$ROOT/infra"
if [[ ! -d node_modules ]]; then
  npm ci
fi

pulumi config set kitsuneos:deploySiteCdn true -s "$STACK"
if ! pulumi up --yes -s "$STACK"; then
  echo "Pulumi up failed while enabling S3 + CloudFront." >&2
  echo "If the error is CloudFront AccessDenied / account must be verified:" >&2
  echo "  1. Open https://console.aws.amazon.com/support/home#/" >&2
  echo "  2. Create a case: Account and billing → Service limit / CloudFront" >&2
  echo "  3. Ask AWS to verify account ${AWS_ACCOUNT_ID:-244546635833} for CloudFront CreateDistribution" >&2
  echo "  4. Re-run this script (or CD site job) after AWS confirms." >&2
  # Roll back the stack flag so app CD is not blocked by a half-enabled site CDN.
  pulumi config set kitsuneos:deploySiteCdn false -s "$STACK" || true
  exit 1
fi

BUCKET=$(pulumi stack output siteBucketName -s "$STACK")
DIST_ID=$(pulumi stack output siteDistributionId -s "$STACK")

if [[ -z "$BUCKET" || -z "$DIST_ID" ]]; then
  echo "Pulumi outputs siteBucketName / siteDistributionId are empty." >&2
  echo "Ensure kitsuneos:deploySiteCdn=true and pulumi up succeeded." >&2
  exit 1
fi

echo "Syncing apps/site/out → s3://${BUCKET} (region ${REGION})"
aws s3 sync "$ROOT/apps/site/out" "s3://${BUCKET}" \
  --region "$REGION" \
  --delete

aws cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/*" \
  --region "$REGION" >/dev/null

DOMAIN=$(pulumi stack output domainName -s "$STACK" 2>/dev/null || echo "kitsuneos.com")
echo "Site deployed to S3 + CloudFront"
echo "  bucket:         ${BUCKET}"
echo "  distribution:   ${DIST_ID}"
echo "  domains:        https://${DOMAIN}  https://www.${DOMAIN}"
