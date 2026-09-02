#!/usr/bin/env bash
set -euo pipefail

# Gate 0b smoke against a deployed app (optional CI / manual).
# Requires DEPLOYED_APP_URL and DEPLOYED_API_KEY.

: "${DEPLOYED_APP_URL:?Set DEPLOYED_APP_URL e.g. https://app.kitsuneos.com}"
: "${DEPLOYED_API_KEY:?Set DEPLOYED_API_KEY}"

if [[ "${DEPLOYED_APP_URL}" != https://* ]]; then
  echo "DEPLOYED_APP_URL must use https://" >&2
  exit 1
fi

MCP_URL="${DEPLOYED_APP_URL%/}/api/mcp/tools/call"
CURL_OPTS=(--connect-timeout 10 --max-time 30 -sf)

curl "${CURL_OPTS[@]}" "${DEPLOYED_APP_URL%/}/health" >/dev/null
echo "Health OK"

curl "${CURL_OPTS[@]}" -X POST "$MCP_URL" \
  -H "Authorization: Bearer $DEPLOYED_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tool":"describe_schema","arguments":{}}'

echo ""
echo "Deployed smoke passed."
