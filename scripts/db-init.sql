-- Initialize KitsuneOS database roles and database
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
