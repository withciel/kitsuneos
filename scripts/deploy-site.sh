#!/usr/bin/env bash
# Deploy marketing site to Cloudflare Pages (static export from apps/site).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="${CLOUDFLARE_PAGES_PROJECT:-kitsuneos}"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-a240575d5a695c24c6d7e157fc700628}"

export PATH="/opt/homebrew/opt/libpq/bin:/opt/homebrew/bin:${PATH:-}"
export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID"

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "CLOUDFLARE_API_TOKEN is required (Pages:Edit + Account:Read)." >&2
  echo "Create one at https://dash.cloudflare.com/profile/api-tokens" >&2
  exit 1
fi

cd "$ROOT"
pnpm --filter @kitsuneos/site build

if [[ ! -d "$ROOT/apps/site/out" ]]; then
  echo "Missing apps/site/out — build failed." >&2
  exit 1
fi

# Create project if it does not exist yet (ignore "already exists").
npx --yes wrangler@4 pages project create "$PROJECT" \
  --production-branch=main \
  2>/dev/null || true

DEPLOY_OUT=$(npx --yes wrangler@4 pages deploy "$ROOT/apps/site/out" \
  --project-name="$PROJECT" \
  --branch=main \
  --commit-dirty=true)

echo "$DEPLOY_OUT"

# Attach custom domains (idempotent).
npx --yes wrangler@4 pages project list >/dev/null
for host in kitsuneos.com www.kitsuneos.com; do
  npx --yes wrangler@4 pages domain add "$host" --project-name="$PROJECT" 2>/dev/null \
    || echo "Domain $host already attached or pending DNS (ok)."
done

echo "Site deployed to Cloudflare Pages project: $PROJECT"
echo "Custom domains: kitsuneos.com, www.kitsuneos.com"
