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
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${ECR_URL%%/*}"
docker build -f "$ROOT/apps/app/Dockerfile" -t "$IMAGE_TAG" -t "${ECR_URL}:latest" "$ROOT"
docker push "$IMAGE_TAG"
docker push "${ECR_URL}:latest"

pulumi config set kitsuneos:deployApp true
pulumi up --yes

if [[ "${SKIP_LOCAL_MIGRATE:-0}" == "1" ]]; then
  echo "Skipping local migrate; container entrypoint runs bootstrap + migrate"
else
  "$ROOT/scripts/run-migrate.sh" "$STACK" || {
    echo "Local migrate failed (RDS is private). Continuing; container entrypoint will migrate."
  }
fi

SERVICE_ARN=$(pulumi stack output appRunnerServiceArn -s "$STACK" 2>/dev/null || true)
if [[ -n "$SERVICE_ARN" ]]; then
  aws apprunner start-deployment --service-arn "$SERVICE_ARN" --region "$REGION"
fi

WEBHOOK_URL="https://${APP_DOMAIN}/api/billing/webhook"
if [[ -n "${DODO_PAYMENTS_API_KEY:-}" ]]; then
  node "$ROOT/scripts/register-dodo-webhook.mjs" "$WEBHOOK_URL" "$STACK"
fi

echo "App image pushed: $IMAGE_TAG and ${ECR_URL}:latest"
