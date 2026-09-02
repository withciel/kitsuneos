#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/opt/homebrew/opt/libpq/bin:/opt/homebrew/bin:${PATH:-}"
export DOCKER_HOST="${DOCKER_HOST:-unix://${HOME}/.colima/default/docker.sock}"

# shellcheck source=scripts/aws-env.sh
source "$ROOT/scripts/aws-env.sh"

cd "$ROOT/infra"
npm install

pulumi up --yes

cd "$ROOT"
./scripts/sync-env-to-aws.sh
SKIP_LOCAL_MIGRATE=1 ./scripts/deploy-site.sh
SKIP_LOCAL_MIGRATE=1 ./scripts/deploy-app.sh

source "$ROOT/scripts/aws-env.sh"
curl -sf "https://$(cd "$ROOT/infra" && pulumi stack output appDomainName)/health"
echo ""
echo "Deploy complete."
