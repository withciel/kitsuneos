#!/usr/bin/env bash
# Export AWS credentials for tools that do not read `aws login` sessions (Pulumi, etc.).
set -euo pipefail

export PATH="/opt/homebrew/opt/libpq/bin:/opt/homebrew/bin:${PATH:-}"
export AWS_REGION="${AWS_REGION:-us-east-1}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-$AWS_REGION}"

refresh_aws_credentials() {
  if ! aws sts get-caller-identity >/dev/null 2>&1; then
    echo "AWS session expired or missing. Run: aws login" >&2
    return 1
  fi
  eval "$(aws configure export-credentials --format env)"
}

if [[ -n "${AWS_ACCESS_KEY_ID:-}" && -n "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
  if aws sts get-caller-identity >/dev/null 2>&1; then
    return 0 2>/dev/null || exit 0
  fi
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
fi

refresh_aws_credentials
