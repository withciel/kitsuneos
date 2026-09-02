#!/usr/bin/env bash
set -euo pipefail

STACK="${1:-staging}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT/infra"
BUCKET=$(pulumi stack output siteBucketName -s "$STACK" 2>/dev/null || true)
DIST_ID=$(pulumi stack output siteDistributionId -s "$STACK" 2>/dev/null || true)

if [[ -z "$BUCKET" || -z "$DIST_ID" ]]; then
  echo "Run pulumi up first and pass a valid stack (staging|prod)."
  exit 1
fi

pnpm --filter @kitsuneos/site build
aws s3 sync "$ROOT/apps/site/out/" "s3://${BUCKET}/" --delete
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*"
echo "Site deployed to s3://${BUCKET}"
