#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/pulumi-stack.sh
source "$ROOT/scripts/pulumi-stack.sh"
STACK="$(resolve_pulumi_stack "$ROOT" "${1:-}")"
REGION="${AWS_REGION:-us-east-1}"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"

export PATH="/opt/homebrew/opt/libpq/bin:/opt/homebrew/bin:${PATH:-}"
# shellcheck source=scripts/aws-env.sh
source "$ROOT/scripts/aws-env.sh"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

cd "$ROOT/infra"
ECR_URL=$(pulumi stack output ecrRepositoryUrl -s "$STACK")
APP_DOMAIN=$(pulumi stack output appDomainName -s "$STACK" 2>/dev/null || echo "app.kitsuneos.com")

if [[ -f "$ENV_FILE" ]]; then
  "$ROOT/scripts/sync-env-to-aws.sh" "$STACK"
fi

IMAGE_TAG="${ECR_URL}:$(git -C "$ROOT" rev-parse --short HEAD)"
# App Runner (Pulumi AWS provider) is x86_64-only in schema; build linux/amd64 even on Apple Silicon.
DOCKER_PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"
# Local Mac often uses Colima; GitHub Actions has Docker Engine on the default socket.
if [[ -z "${DOCKER_HOST:-}" ]]; then
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
    : # use runner default docker.sock
  elif [[ -S "${HOME}/.colima/default/docker.sock" ]]; then
    export DOCKER_HOST="unix://${HOME}/.colima/default/docker.sock"
  fi
fi
# Colima/local docker often break on Docker Desktop's osxkeychain credsStore.
if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
  : # keep runner Docker config
else
  export DOCKER_CONFIG="${DOCKER_CONFIG:-/tmp/docker-colima-cfg}"
  mkdir -p "$DOCKER_CONFIG/cli-plugins"
  if [[ ! -f "$DOCKER_CONFIG/config.json" ]]; then
    printf '%s\n' '{"auths":{}}' >"$DOCKER_CONFIG/config.json"
  fi
  # Prefer a real buildx binary (OrbStack symlinks break when OrbStack isn't installed).
  if [[ -x "${HOME}/.docker/cli-plugins/docker-buildx" ]]; then
    ln -sfn "${HOME}/.docker/cli-plugins/docker-buildx" "$DOCKER_CONFIG/cli-plugins/docker-buildx"
  elif [[ -x /tmp/docker-cli-plugins/docker-buildx ]]; then
    ln -sfn /tmp/docker-cli-plugins/docker-buildx "$DOCKER_CONFIG/cli-plugins/docker-buildx"
  elif [[ -x /usr/libexec/docker/cli-plugins/docker-buildx ]]; then
    ln -sfn /usr/libexec/docker/cli-plugins/docker-buildx "$DOCKER_CONFIG/cli-plugins/docker-buildx"
  fi
fi
# Use BuildKit when buildx is available; otherwise fall back to the legacy builder.
if docker buildx version >/dev/null 2>&1; then
  export DOCKER_BUILDKIT=1
else
  echo "docker buildx missing — falling back to DOCKER_BUILDKIT=0"
  export DOCKER_BUILDKIT=0
fi
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${ECR_URL%%/*}"
# BuildKit: compile Next on host arch, emit TARGETPLATFORM (amd64) runtime for App Runner.
docker build \
  --platform "$DOCKER_PLATFORM" \
  -f "$ROOT/apps/app/Dockerfile" \
  -t "$IMAGE_TAG" \
  -t "${ECR_URL}:latest" \
  "$ROOT"
docker push "$IMAGE_TAG"
docker push "${ECR_URL}:latest"

pulumi config set kitsuneos:deployApp true -s "$STACK"
# App CD must not fail when the AWS account still cannot create CloudFront
# distributions (account verification). Keep site CDN only once a dist exists.
SITE_DIST=$(pulumi stack output siteDistributionId -s "$STACK" 2>/dev/null || true)
if [[ -z "${SITE_DIST}" ]]; then
  echo "siteDistributionId empty — setting kitsuneos:deploySiteCdn=false for this app update"
  pulumi config set kitsuneos:deploySiteCdn false -s "$STACK"
fi
pulumi up --yes -s "$STACK"

if [[ "${SKIP_LOCAL_MIGRATE:-0}" == "1" ]]; then
  echo "Skipping local migrate; container entrypoint runs bootstrap + migrate"
else
  "$ROOT/scripts/run-migrate.sh" "$STACK" || {
    echo "Local migrate failed (RDS is private). Continuing; container entrypoint will migrate."
  }
fi

wait_for_apprunner_status() {
  local arn="$1"
  local want="$2"
  local timeout_s="${3:-900}"
  local started
  started="$(date +%s)"
  while true; do
    local status
    status="$(
      aws apprunner describe-service \
        --service-arn "$arn" \
        --region "$REGION" \
        --query 'Service.Status' \
        --output text 2>/dev/null || echo UNKNOWN
    )"
    echo "App Runner status: ${status} (want ${want})"
    if [[ "$status" == "$want" ]]; then
      return 0
    fi
    # CREATE_FAILED / DELETE_* are not recoverable by waiting.
    case "$status" in
      CREATE_FAILED|DELETE_FAILED|DELETED)
        echo "App Runner is in terminal status ${status}; cannot deploy" >&2
        return 1
        ;;
    esac
    if (( "$(date +%s)" - started >= timeout_s )); then
      echo "Timed out after ${timeout_s}s waiting for App Runner ${want} (last: ${status})" >&2
      return 1
    fi
    sleep 15
  done
}

start_apprunner_deployment() {
  local arn="$1"
  local attempts="${2:-8}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    wait_for_apprunner_status "$arn" RUNNING 900
    if aws apprunner start-deployment \
      --service-arn "$arn" \
      --region "$REGION"; then
      echo "Started App Runner deployment"
      # Block until this deployment settles so the next CD run does not race.
      wait_for_apprunner_status "$arn" RUNNING 1200
      return 0
    fi
    echo "start-deployment attempt ${i}/${attempts} failed; retrying…" >&2
    sleep 20
  done
  echo "Failed to start App Runner deployment after ${attempts} attempts" >&2
  return 1
}

SERVICE_ARN=$(pulumi stack output appRunnerServiceArn -s "$STACK" 2>/dev/null || true)
if [[ -n "$SERVICE_ARN" ]]; then
  start_apprunner_deployment "$SERVICE_ARN"
fi

WEBHOOK_URL="https://${APP_DOMAIN}/api/billing/webhook"
if [[ -n "${DODO_PAYMENTS_API_KEY:-}" ]]; then
  # Billing webhook sync is best-effort; do not fail the app deploy on Dodo API drift.
  node "$ROOT/scripts/register-dodo-webhook.mjs" "$WEBHOOK_URL" "$STACK" \
    || echo "warn: Dodo webhook registration failed (app deploy still OK)" >&2
fi

echo "App image pushed: $IMAGE_TAG and ${ECR_URL}:latest"
