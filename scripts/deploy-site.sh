#!/usr/bin/env bash
# Deploy marketing site to AWS S3 (static export from apps/site).
# Default: public S3 website hosting (no CloudFront) so CD works while the
# AWS account is still blocked from CreateDistribution.
# Opt into CloudFront with SITE_CDN=1 once AWS verifies the account.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/pulumi-stack.sh
source "$ROOT/scripts/pulumi-stack.sh"
STACK="$(resolve_pulumi_stack "$ROOT" "${1:-}")"
REGION="${AWS_REGION:-us-east-1}"
SITE_CDN="${SITE_CDN:-0}"

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

pulumi config set kitsuneos:deploySite true -s "$STACK"
if [[ "$SITE_CDN" == "1" ]]; then
  pulumi config set kitsuneos:deploySiteCdn true -s "$STACK"
else
  pulumi config set kitsuneos:deploySiteCdn false -s "$STACK"
fi

if ! pulumi up --yes -s "$STACK"; then
  echo "Pulumi up failed while enabling site hosting." >&2
  if [[ "$SITE_CDN" == "1" ]]; then
    echo "If the error is CloudFront AccessDenied / account must be verified:" >&2
    echo "  1. Open https://console.aws.amazon.com/support/home#/" >&2
    echo "  2. Create a case: Account and billing → Service limit / CloudFront" >&2
    echo "  3. Ask AWS to verify account ${AWS_ACCOUNT_ID:-244546635833} for CloudFront CreateDistribution" >&2
    echo "  4. Or re-run without CDN: SITE_CDN=0 ./scripts/deploy-site.sh" >&2
    pulumi config set kitsuneos:deploySiteCdn false -s "$STACK" || true
  fi
  exit 1
fi

BUCKET=$(pulumi stack output siteBucketName -s "$STACK")
if [[ -z "$BUCKET" ]]; then
  echo "Pulumi output siteBucketName is empty." >&2
  echo "Ensure kitsuneos:deploySite=true and pulumi up succeeded." >&2
  exit 1
fi

echo "Syncing apps/site/out → s3://${BUCKET} (region ${REGION})"
aws s3 sync "$ROOT/apps/site/out" "s3://${BUCKET}" \
  --region "$REGION" \
  --delete

HOSTING=$(pulumi stack output siteHosting -s "$STACK" 2>/dev/null || echo "unknown")
ENDPOINT=$(pulumi stack output siteWebsiteEndpoint -s "$STACK" 2>/dev/null || true)
DIST_ID=$(pulumi stack output siteDistributionId -s "$STACK" 2>/dev/null || true)

if [[ -n "$DIST_ID" && "$HOSTING" == "cloudfront" ]]; then
  aws cloudfront create-invalidation \
    --distribution-id "$DIST_ID" \
    --paths "/*" \
    --region "$REGION" >/dev/null
fi

DOMAIN=$(pulumi stack output domainName -s "$STACK" 2>/dev/null || echo "kitsuneos.com")
echo "Site deployed (${HOSTING})"
echo "  bucket:         ${BUCKET}"
if [[ -n "$ENDPOINT" ]]; then
  echo "  website:        http://${ENDPOINT}"
fi
if [[ -n "$DIST_ID" ]]; then
  echo "  distribution:   ${DIST_ID}"
  echo "  domains:        https://${DOMAIN}  https://www.${DOMAIN}"
fi
