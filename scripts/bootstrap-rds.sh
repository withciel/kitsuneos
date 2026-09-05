#!/usr/bin/env bash
set -euo pipefail

# Creates kitsune_owner and kitsune_app roles on a fresh RDS instance.
# Requires KITSUNE_ADMIN_URL, KITSUNE_OWNER_PASSWORD, KITSUNE_APP_PASSWORD.

: "${KITSUNE_ADMIN_URL:?KITSUNE_ADMIN_URL required}"
: "${KITSUNE_OWNER_PASSWORD:?KITSUNE_OWNER_PASSWORD required}"
: "${KITSUNE_APP_PASSWORD:?KITSUNE_APP_PASSWORD required}"

psql "$KITSUNE_ADMIN_URL" \
  -v ON_ERROR_STOP=1 \
  -v owner_password="$KITSUNE_OWNER_PASSWORD" \
  -v app_password="$KITSUNE_APP_PASSWORD" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kitsune_owner') THEN
    EXECUTE format('CREATE ROLE kitsune_owner WITH LOGIN PASSWORD %L CREATEDB', :'owner_password');
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kitsune_app') THEN
    EXECUTE format('CREATE ROLE kitsune_app WITH LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS', :'app_password');
  END IF;
END
$$;
GRANT kitsune_owner TO CURRENT_USER;
CREATE EXTENSION IF NOT EXISTS vector;
SQL

echo "RDS bootstrap complete"
