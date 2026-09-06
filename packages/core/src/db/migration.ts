export const CONTROL_PLANE_MIGRATION = `
CREATE SCHEMA IF NOT EXISTS kitsune AUTHORIZATION kitsune_owner;

CREATE TABLE IF NOT EXISTS kitsune.workspaces (
  id            uuid PRIMARY KEY,
  slug          text UNIQUE NOT NULL,
  schema_name   text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE kitsune.workspaces
  ADD COLUMN IF NOT EXISTS parent_workspace_id uuid REFERENCES kitsune.workspaces(id);
ALTER TABLE kitsune.workspaces
  ADD COLUMN IF NOT EXISTS branch_name text;
ALTER TABLE kitsune.workspaces
  ADD COLUMN IF NOT EXISTS branched_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_parent_branch_name_idx
  ON kitsune.workspaces (parent_workspace_id, branch_name)
  WHERE parent_workspace_id IS NOT NULL AND branch_name IS NOT NULL;

CREATE TABLE IF NOT EXISTS kitsune.principals (
  id            uuid PRIMARY KEY,
  workspace_id  uuid NOT NULL REFERENCES kitsune.workspaces(id),
  kind          text NOT NULL CHECK (kind IN ('human','agent','service')),
  display_name  text NOT NULL,
  acts_for      uuid REFERENCES kitsune.principals(id),
  disabled_at   timestamptz
);

-- R16: stable external identity so the same subject can be resolved across workspaces.
ALTER TABLE kitsune.principals
  ADD COLUMN IF NOT EXISTS external_issuer text;
ALTER TABLE kitsune.principals
  ADD COLUMN IF NOT EXISTS external_subject text;
DROP INDEX IF EXISTS kitsune.principals_external_identity_idx;
CREATE UNIQUE INDEX IF NOT EXISTS principals_workspace_external_identity_idx
  ON kitsune.principals (workspace_id, external_issuer, external_subject)
  WHERE external_subject IS NOT NULL AND disabled_at IS NULL;

CREATE TABLE IF NOT EXISTS kitsune.collections (
  id            uuid PRIMARY KEY,
  workspace_id  uuid NOT NULL REFERENCES kitsune.workspaces(id),
  name          text NOT NULL,
  table_name    text NOT NULL,
  schema_version int NOT NULL DEFAULT 1,
  revision_retention_days int,
  UNIQUE (workspace_id, name)
);

ALTER TABLE kitsune.collections
  ADD COLUMN IF NOT EXISTS revision_retention_days int;

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

ALTER TABLE kitsune.fields
  ADD COLUMN IF NOT EXISTS rollup jsonb;

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

-- One-time API key reveal after signup (cleared when Settings loads /api/me).
ALTER TABLE kitsune.users
  ADD COLUMN IF NOT EXISTS pending_api_key text;

CREATE TABLE IF NOT EXISTS kitsune.provisioning_steps (
  workos_id     text PRIMARY KEY,
  step          text NOT NULL,
  completed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kitsune.subscriptions (
  id                    uuid PRIMARY KEY,
  workspace_id          uuid NOT NULL REFERENCES kitsune.workspaces(id),
  dodo_subscription_id  text UNIQUE,
  dodo_customer_id      text,
  status                text NOT NULL CHECK (status IN
                          ('pending','active','on_hold','paused','cancelled','failed','expired','past_due')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  last_webhook_at       timestamptz
);
CREATE INDEX IF NOT EXISTS subscriptions_workspace_idx
  ON kitsune.subscriptions (workspace_id, created_at DESC);

ALTER TABLE kitsune.subscriptions
  ADD COLUMN IF NOT EXISTS last_webhook_at timestamptz;

CREATE TABLE IF NOT EXISTS kitsune.billing_events (
  event_id       text PRIMARY KEY,
  payload        jsonb NOT NULL,
  processed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kitsune.usage_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES kitsune.workspaces(id),
  kind           text NOT NULL,
  count          int NOT NULL DEFAULT 1,
  at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_events_workspace_at_idx
  ON kitsune.usage_events (workspace_id, at DESC);

CREATE TABLE IF NOT EXISTS kitsune.schema_revisions (
  id             uuid PRIMARY KEY,
  collection_id  uuid NOT NULL REFERENCES kitsune.collections(id),
  version        int NOT NULL,
  op             text NOT NULL CHECK (op IN ('addField','dropField','setIndexed')),
  payload        jsonb NOT NULL,
  ddl_up         text NOT NULL,
  ddl_down       text NOT NULL,
  applied_at     timestamptz NOT NULL DEFAULT now(),
  reverted_at    timestamptz,
  UNIQUE (collection_id, version)
);

CREATE INDEX IF NOT EXISTS audit_log_workspace_at_idx
  ON kitsune.audit_log (workspace_id, at DESC);
CREATE INDEX IF NOT EXISTS audit_log_workspace_principal_at_idx
  ON kitsune.audit_log (workspace_id, principal_id, at DESC);
CREATE INDEX IF NOT EXISTS audit_log_workspace_collection_at_idx
  ON kitsune.audit_log (workspace_id, collection_id, at DESC);

-- Content-addressed attachment metadata (blobs live in object storage / local dir).

ALTER TABLE kitsune.change_sets
  ADD COLUMN IF NOT EXISTS confidence double precision;
ALTER TABLE kitsune.change_sets
  ADD COLUMN IF NOT EXISTS approval_principal_ids uuid[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS kitsune.automation_policies (
  id            uuid PRIMARY KEY,
  workspace_id  uuid NOT NULL REFERENCES kitsune.workspaces(id),
  name          text NOT NULL,
  enabled       boolean NOT NULL DEFAULT true,
  kind          text NOT NULL CHECK (kind IN ('auto_apply', 'min_approvals')),
  config        jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON kitsune.automation_policies TO kitsune_app;

CREATE TABLE IF NOT EXISTS kitsune.webhook_endpoints (
  id            uuid PRIMARY KEY,
  workspace_id  uuid NOT NULL REFERENCES kitsune.workspaces(id),
  url           text NOT NULL,
  secret        text NOT NULL,
  events        text[] NOT NULL,
  enabled       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_endpoints_workspace_idx
  ON kitsune.webhook_endpoints (workspace_id);

CREATE TABLE IF NOT EXISTS kitsune.webhook_deliveries (
  id             uuid PRIMARY KEY,
  endpoint_id    uuid NOT NULL REFERENCES kitsune.webhook_endpoints(id) ON DELETE CASCADE,
  workspace_id   uuid NOT NULL REFERENCES kitsune.workspaces(id),
  event_type     text NOT NULL,
  payload        jsonb NOT NULL,
  status         text NOT NULL CHECK (status IN ('pending','delivered','failed')),
  attempt_count  int NOT NULL DEFAULT 0,
  last_error     text,
  change_set_id  uuid REFERENCES kitsune.change_sets(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_deliveries_endpoint_idx
  ON kitsune.webhook_deliveries (endpoint_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON kitsune.webhook_endpoints TO kitsune_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON kitsune.webhook_deliveries TO kitsune_app;

CREATE TABLE IF NOT EXISTS kitsune.merge_queue (
  id              uuid PRIMARY KEY,
  workspace_id    uuid NOT NULL REFERENCES kitsune.workspaces(id),
  change_set_id   uuid NOT NULL REFERENCES kitsune.change_sets(id),
  enqueued_by     uuid NOT NULL REFERENCES kitsune.principals(id),
  status          text NOT NULL CHECK (
                    status IN ('pending','processing','applied','blocked','cancelled')
                  ),
  enqueued_at     timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz,
  last_error      text
);
CREATE INDEX IF NOT EXISTS merge_queue_workspace_pending_idx
  ON kitsune.merge_queue (workspace_id, status, enqueued_at, id);
CREATE UNIQUE INDEX IF NOT EXISTS merge_queue_active_change_set_idx
  ON kitsune.merge_queue (change_set_id)
  WHERE status IN ('pending', 'processing');

GRANT SELECT, INSERT, UPDATE, DELETE ON kitsune.merge_queue TO kitsune_app;


CREATE TABLE IF NOT EXISTS kitsune.attachments (
  id             uuid PRIMARY KEY,
  workspace_id   uuid NOT NULL REFERENCES kitsune.workspaces(id),
  collection_id  uuid NOT NULL REFERENCES kitsune.collections(id),
  record_id      uuid NOT NULL,
  field_name     text NOT NULL,
  content_hash   text NOT NULL,
  content_type   text NOT NULL,
  byte_size      bigint NOT NULL,
  file_name      text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL REFERENCES kitsune.principals(id)
);

CREATE INDEX IF NOT EXISTS attachments_workspace_record_idx
  ON kitsune.attachments (workspace_id, collection_id, record_id);
CREATE UNIQUE INDEX IF NOT EXISTS attachments_dedupe_idx
  ON kitsune.attachments (workspace_id, collection_id, record_id, field_name, content_hash);

GRANT SELECT, INSERT, UPDATE ON kitsune.attachments TO kitsune_app;

-- ---------------------------------------------------------------------------
-- Accounts, workspace memberships, and teams
-- ---------------------------------------------------------------------------

ALTER TABLE kitsune.workspaces
  ADD COLUMN IF NOT EXISTS name text;

UPDATE kitsune.workspaces
   SET name = slug
 WHERE name IS NULL;

-- Team principals share the principals table so grants stay principal-scoped.
ALTER TABLE kitsune.principals DROP CONSTRAINT IF EXISTS principals_kind_check;
ALTER TABLE kitsune.principals DROP CONSTRAINT IF EXISTS kitsune_principals_kind_check;
ALTER TABLE kitsune.principals
  ADD CONSTRAINT principals_kind_check
  CHECK (kind IN ('human', 'agent', 'service', 'team'));

-- users = login account (WorkOS). workspace_id/principal_id remain the
-- last-active workspace pointers (nullable after backfill).
CREATE TABLE IF NOT EXISTS kitsune.workspace_memberships (
  id            uuid PRIMARY KEY,
  workspace_id  uuid NOT NULL REFERENCES kitsune.workspaces(id),
  principal_id  uuid NOT NULL REFERENCES kitsune.principals(id),
  user_id       uuid REFERENCES kitsune.users(id),
  email         text NOT NULL,
  role          text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (principal_id),
  UNIQUE (workspace_id, email)
);
CREATE INDEX IF NOT EXISTS workspace_memberships_user_idx
  ON kitsune.workspace_memberships (user_id)
  WHERE user_id IS NOT NULL;

INSERT INTO kitsune.workspace_memberships
  (id, workspace_id, principal_id, user_id, email, role)
SELECT u.id, u.workspace_id, u.principal_id, u.id, u.email, 'owner'
  FROM kitsune.users u
 WHERE u.workspace_id IS NOT NULL
   AND u.principal_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM kitsune.workspace_memberships m
      WHERE m.workspace_id = u.workspace_id AND m.email = u.email
   );

ALTER TABLE kitsune.users ALTER COLUMN workspace_id DROP NOT NULL;
ALTER TABLE kitsune.users ALTER COLUMN principal_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS kitsune.teams (
  id            uuid PRIMARY KEY,
  workspace_id  uuid NOT NULL REFERENCES kitsune.workspaces(id),
  name          text NOT NULL,
  principal_id  uuid NOT NULL REFERENCES kitsune.principals(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name),
  UNIQUE (principal_id)
);

CREATE TABLE IF NOT EXISTS kitsune.team_members (
  team_id       uuid NOT NULL REFERENCES kitsune.teams(id) ON DELETE CASCADE,
  principal_id  uuid NOT NULL REFERENCES kitsune.principals(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, principal_id)
);
CREATE INDEX IF NOT EXISTS team_members_principal_idx
  ON kitsune.team_members (principal_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON kitsune.workspace_memberships TO kitsune_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON kitsune.teams TO kitsune_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON kitsune.team_members TO kitsune_app;

-- ---------------------------------------------------------------------------
-- Page visibility + shares (Notion-like private / workspace / shared)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS kitsune.page_access (
  workspace_id        uuid NOT NULL REFERENCES kitsune.workspaces(id) ON DELETE CASCADE,
  collection_id       uuid NOT NULL REFERENCES kitsune.collections(id) ON DELETE CASCADE,
  record_id           uuid NOT NULL,
  visibility          text NOT NULL CHECK (visibility IN ('private', 'workspace', 'shared')),
  owner_principal_id  uuid NOT NULL REFERENCES kitsune.principals(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, collection_id, record_id)
);
CREATE INDEX IF NOT EXISTS page_access_owner_idx
  ON kitsune.page_access (workspace_id, owner_principal_id);

CREATE TABLE IF NOT EXISTS kitsune.page_shares (
  id                  uuid PRIMARY KEY,
  workspace_id        uuid NOT NULL REFERENCES kitsune.workspaces(id) ON DELETE CASCADE,
  collection_id       uuid NOT NULL REFERENCES kitsune.collections(id) ON DELETE CASCADE,
  record_id           uuid NOT NULL,
  grantee_principal_id uuid NOT NULL REFERENCES kitsune.principals(id),
  capability          text NOT NULL CHECK (capability IN ('read', 'write', 'full')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, collection_id, record_id, grantee_principal_id)
);
CREATE INDEX IF NOT EXISTS page_shares_grantee_idx
  ON kitsune.page_shares (workspace_id, grantee_principal_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON kitsune.page_access TO kitsune_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON kitsune.page_shares TO kitsune_app;

-- ---------------------------------------------------------------------------
-- OAuth applications (third parties using Kitsune as their database)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS kitsune.oauth_apps (
  id                  uuid PRIMARY KEY,
  workspace_id        uuid NOT NULL REFERENCES kitsune.workspaces(id) ON DELETE CASCADE,
  name                text NOT NULL,
  client_id           text NOT NULL UNIQUE,
  client_secret_hash  text NOT NULL,
  redirect_uris       text[] NOT NULL DEFAULT '{}',
  scopes              text[] NOT NULL DEFAULT '{databases:create,records:read,records:write}',
  principal_id        uuid NOT NULL REFERENCES kitsune.principals(id),
  created_by          uuid NOT NULL REFERENCES kitsune.principals(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  revoked_at          timestamptz
);
CREATE INDEX IF NOT EXISTS oauth_apps_workspace_idx
  ON kitsune.oauth_apps (workspace_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS kitsune.oauth_access_tokens (
  id                  uuid PRIMARY KEY,
  app_id              uuid NOT NULL REFERENCES kitsune.oauth_apps(id) ON DELETE CASCADE,
  workspace_id        uuid NOT NULL REFERENCES kitsune.workspaces(id) ON DELETE CASCADE,
  principal_id        uuid NOT NULL REFERENCES kitsune.principals(id),
  token_hash          text NOT NULL UNIQUE,
  scopes              text[] NOT NULL,
  expires_at          timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  revoked_at          timestamptz
);
CREATE INDEX IF NOT EXISTS oauth_access_tokens_app_idx
  ON kitsune.oauth_access_tokens (app_id)
  WHERE revoked_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON kitsune.oauth_apps TO kitsune_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON kitsune.oauth_access_tokens TO kitsune_app;

-- ---------------------------------------------------------------------------
-- Wiki-links extracted from prose (Obsidian-style [[Title]] / [[col:id]])
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS kitsune.page_links (
  id                 uuid PRIMARY KEY,
  workspace_id       uuid NOT NULL REFERENCES kitsune.workspaces(id) ON DELETE CASCADE,
  from_collection_id uuid NOT NULL REFERENCES kitsune.collections(id) ON DELETE CASCADE,
  from_record_id     uuid NOT NULL,
  to_collection_id   uuid REFERENCES kitsune.collections(id) ON DELETE SET NULL,
  to_record_id       uuid,
  raw_target         text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, from_collection_id, from_record_id, raw_target)
);
CREATE INDEX IF NOT EXISTS page_links_from_idx
  ON kitsune.page_links (workspace_id, from_collection_id, from_record_id);
CREATE INDEX IF NOT EXISTS page_links_to_idx
  ON kitsune.page_links (workspace_id, to_collection_id, to_record_id)
  WHERE to_record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS page_links_raw_idx
  ON kitsune.page_links (workspace_id, raw_target);

GRANT SELECT, INSERT, UPDATE, DELETE ON kitsune.page_links TO kitsune_app;
`;
