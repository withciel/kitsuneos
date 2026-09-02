#!/usr/bin/env bash
# Resolve Pulumi stack: explicit arg, or current stack from infra/.
resolve_pulumi_stack() {
  local root="$1"
  local explicit="${2:-}"
  if [[ -n "$explicit" ]]; then
    echo "$explicit"
    return
  fi
  cd "$root/infra"
  pulumi stack --show-name
}
