#!/usr/bin/env bash
set -euo pipefail

STACK="${1:-staging}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_REGION:-us-east-1}"

cd "$ROOT/infra"
ECR_URL=$(pulumi stack output ecrRepositoryUrl -s "$STACK")
APP_DOMAIN=$(pulumi stack output appDomainName -s "$STACK" 2>/dev/null || echo "app.kitsuneos.com")

IMAGE_TAG="${ECR_URL}:$(git -C "$ROOT" rev-parse --short HEAD)"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${ECR_URL%%/*}"
docker build -f "$ROOT/apps/app/Dockerfile" -t "$IMAGE_TAG" -t "${ECR_URL}:latest" "$ROOT"
docker push "$IMAGE_TAG"
docker push "${ECR_URL}:latest"

"$ROOT/scripts/run-migrate.sh" "$STACK"

SERVICE_ARN=$(pulumi stack output appRunnerServiceArn -s "$STACK" 2>/dev/null || true)
if [[ -n "$SERVICE_ARN" ]]; then
  aws apprunner start-deployment --service-arn "$SERVICE_ARN" --region "$REGION"
fi

WEBHOOK_URL="https://${APP_DOMAIN}/api/billing/webhook"
if [[ -n "${DODO_PAYMENTS_API_KEY:-}" ]]; then
  node "$ROOT/scripts/register-dodo-webhook.mjs" "$WEBHOOK_URL" "$STACK"
fi

echo "App image pushed: $IMAGE_TAG and ${ECR_URL}:latest"
