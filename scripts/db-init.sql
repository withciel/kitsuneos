-- Initialize KitsuneOS database roles and database.
-- Safe to run against either the `postgres` maintenance DB or an existing
-- `kitsune` DB (GitHub Actions creates the latter via POSTGRES_DB).

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kitsune_owner') THEN
    CREATE ROLE kitsune_owner WITH LOGIN PASSWORD 'kitsune_owner' CREATEDB;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kitsune_app') THEN
    CREATE ROLE kitsune_app WITH LOGIN PASSWORD 'kitsune_app' NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

SELECT 'CREATE DATABASE kitsune OWNER kitsune_owner'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'kitsune')\gexec

-- CI services may create `kitsune` as the postgres roleuser first. Transfer
-- ownership so migrations connecting as kitsune_owner can create schemas.
ALTER DATABASE kitsune OWNER TO kitsune_owner;
GRANT CONNECT ON DATABASE kitsune TO kitsune_app;

-- pgvector lives in the same Postgres as records (ADR-004). Requires a
-- pgvector-enabled image (pgvector/pgvector:pg16). Created as superuser.
\c kitsune
CREATE EXTENSION IF NOT EXISTS vector;
