export const CONTROL_PLANE_MIGRATION = `
CREATE SCHEMA IF NOT EXISTS kitsune AUTHORIZATION kitsune_owner;

CREATE TABLE IF NOT EXISTS kitsune.workspaces (
  id            uuid PRIMARY KEY,
  slug          text UNIQUE NOT NULL,
  schema_name   text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kitsune.principals (
  id            uuid PRIMARY KEY,
  workspace_id  uuid NOT NULL REFERENCES kitsune.workspaces(id),
  kind          text NOT NULL CHECK (kind IN ('human','agent','service')),
  display_name  text NOT NULL,
  acts_for      uuid REFERENCES kitsune.principals(id),
  disabled_at   timestamptz
);

CREATE TABLE IF NOT EXISTS kitsune.collections (
  id            uuid PRIMARY KEY,
  workspace_id  uuid NOT NULL REFERENCES kitsune.workspaces(id),
  name          text NOT NULL,
  table_name    text NOT NULL,
  schema_version int NOT NULL DEFAULT 1,
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS kitsune.fields (
  id              uuid PRIMARY KEY,
  collection_id   uuid NOT NULL REFERENCES kitsune.collections(id),
  name            text NOT NULL,
  type            text NOT NULL,
  nullable        boolean NOT NULL DEFAULT true,
  relation_target uuid REFERENCES kitsune.collections(id),
  relation_kind   text,
  enum_values     text[],
  indexed         boolean NOT NULL DEFAULT false,
  UNIQUE (collection_id, name)
);

CREATE TABLE IF NOT EXISTS kitsune.grants (
  id            uuid PRIMARY KEY,
  workspace_id  uuid NOT NULL REFERENCES kitsune.workspaces(id),
  principal_id  uuid NOT NULL REFERENCES kitsune.principals(id),
  collection_id uuid NOT NULL REFERENCES kitsune.collections(id),
  capability    text NOT NULL CHECK (capability IN
                  ('none','read','propose','write','admin')),
  field_mask    text[],
  row_predicate jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz
);
CREATE INDEX IF NOT EXISTS grants_principal_collection_idx
  ON kitsune.grants (principal_id, collection_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS kitsune.change_sets (
  id             uuid PRIMARY KEY,
  workspace_id   uuid NOT NULL REFERENCES kitsune.workspaces(id),
  author_id      uuid NOT NULL REFERENCES kitsune.principals(id),
  status         text NOT NULL CHECK (status IN
                   ('open','blocked','applied','rejected','stale','expired')),
  title          text,
  rationale      text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  decided_at     timestamptz,
  decided_by     uuid REFERENCES kitsune.principals(id),
  expires_at     timestamptz NOT NULL DEFAULT now() + interval '30 days',
  -- How often two change sets raced for the same field. Nothing reads this yet;
  -- it is the evidence for whether a merge queue is worth building, and it
  -- cannot be reconstructed after the fact.
  conflict_count    int NOT NULL DEFAULT 0,
  conflicted_fields text[] NOT NULL DEFAULT '{}'
);

ALTER TABLE kitsune.change_sets
  ADD COLUMN IF NOT EXISTS conflict_count int NOT NULL DEFAULT 0;
ALTER TABLE kitsune.change_sets
  ADD COLUMN IF NOT EXISTS conflicted_fields text[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS kitsune.change_ops (
  id             uuid PRIMARY KEY,
  change_set_id  uuid NOT NULL REFERENCES kitsune.change_sets(id),
  collection_id  uuid NOT NULL REFERENCES kitsune.collections(id),
  record_id      uuid,
  op             text NOT NULL CHECK (op IN ('insert','update','delete')),
  field_name     text,
  base_revision  bigint,
  new_value      jsonb,
  status         text NOT NULL DEFAULT 'proposed'
                   CHECK (status IN ('proposed','approved','rejected','conflicted')),
  review_comment text,
  seq            int NOT NULL
);
CREATE INDEX IF NOT EXISTS change_ops_set_seq_idx
  ON kitsune.change_ops (change_set_id, seq);
CREATE INDEX IF NOT EXISTS change_ops_record_idx
  ON kitsune.change_ops (collection_id, record_id)
  WHERE status IN ('proposed','approved');

CREATE TABLE IF NOT EXISTS kitsune.audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES kitsune.workspaces(id),
  principal_id   uuid NOT NULL REFERENCES kitsune.principals(id),
  action         text NOT NULL,
  collection_id  uuid REFERENCES kitsune.collections(id),
  record_ids     uuid[],
  field_names    text[],
  outcome        text NOT NULL CHECK (outcome IN ('allowed','denied')),
  reason         text,
  detail         jsonb,
  at             timestamptz NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA kitsune TO kitsune_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA kitsune TO kitsune_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA kitsune TO kitsune_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA kitsune GRANT SELECT, INSERT, UPDATE ON TABLES TO kitsune_app;

-- Must come after the blanket grant above, which would otherwise hand UPDATE
-- straight back and leave the audit log rewritable by the application role.
REVOKE UPDATE, DELETE ON kitsune.audit_log FROM kitsune_app;

CREATE TABLE IF NOT EXISTS kitsune.api_keys (
  id            uuid PRIMARY KEY,
  principal_id  uuid NOT NULL REFERENCES kitsune.principals(id),
  prefix        text NOT NULL,
  key_hash      text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);
CREATE INDEX IF NOT EXISTS api_keys_prefix_idx
  ON kitsune.api_keys (prefix)
  WHERE revoked_at IS NULL;

INSERT INTO kitsune.workspaces (id, slug, schema_name)
SELECT '00000000-0000-0000-0000-000000000001', '_system', 'ws_00000000000000000000000000000001'
WHERE NOT EXISTS (
  SELECT 1 FROM kitsune.workspaces WHERE id = '00000000-0000-0000-0000-000000000001'
);

INSERT INTO kitsune.principals (id, workspace_id, kind, display_name)
SELECT '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'service', 'system'
WHERE NOT EXISTS (
  SELECT 1 FROM kitsune.principals WHERE id = '00000000-0000-0000-0000-000000000002'
);

CREATE TABLE IF NOT EXISTS kitsune.users (
  id            uuid PRIMARY KEY,
  workos_id     text UNIQUE NOT NULL,
  email         text NOT NULL,
  workspace_id  uuid NOT NULL REFERENCES kitsune.workspaces(id),
  principal_id  uuid NOT NULL REFERENCES kitsune.principals(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kitsune.provisioning_steps (
  workos_id     text PRIMARY KEY,
  step          text NOT NULL,
  completed_at  timestamptz NOT NULL DEFAULT now()
);
`;
