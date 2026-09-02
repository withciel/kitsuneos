## Learned User Preferences

- Treat `docs/prd.md` and `docs/system-design.md` as the source of truth; on conflicts, System Design wins on technical matters and the PRD wins on scope and priority.
- Do not reopen the PRD §8 pre-decided answers mid-build: agent `propose` ceiling (admin may grant `write` with audit), reviewable unit is the operation / atomic unit is the change set, predicate exclusions return not-found (never forbidden), agents are first-class principals (`acts_for` unused in the first slice).
- Honor the non-negotiable engine constraints: field-level change ops with per-field `base_revision`, single authorization path through the query compiler, no `SELECT *`, compiled (never interpolated) row predicates, deferrable FKs, field masks on aggregates, and RLS only as a cheap workspace/soft-delete backstop.
- Dodo Payments `test_mode` is fine for staging / first deploy; keep API key, product ID, environment, and webhook secret all from the same Dodo environment (do not mix test and live).
- When asked to deploy, install missing local tooling if needed and proceed; prefer concrete step-by-step deploy guidance over high-level overviews.

## Learned Workspace Facts

- KitsuneOS is a pnpm/turbo monorepo; core engine lives under `packages/` with MCP as the primary API surface; acceptance tests expect real Postgres.
- Hosted AWS stack targets `kitsuneos.com` (site) and `app.kitsuneos.com` (app) in `us-east-1`, with Pulumi infra in `infra/` (VPC, private RDS Postgres 16, S3/CloudFront, ECR, App Runner).
- Auth is WorkOS AuthKit; billing is Dodo Payments; WorkOS redirect URI is `https://app.kitsuneos.com/callback`.
- Root `.env` is gitignored and not read by App Runner; sync secrets to AWS Secrets Manager via `scripts/sync-env-to-aws.sh` after `pulumi up`.
- RDS is private: laptop migrate often fails; use `SKIP_LOCAL_MIGRATE=1` for site/app deploy scripts and rely on container bootstrap/migrate (`scripts/docker-entrypoint.mjs` / `scripts/bootstrap-rds.mjs`).
- Deploy order is roughly: `infra` `pulumi install` + `pulumi up`, then `sync-env-to-aws.sh`, then `deploy-site.sh` and `deploy-app.sh` (webhook secret is created on app deploy).
- Pulumi project name is `kitsuneos`; the active stack has been `kitsuneos` (not necessarily `staging`); deploy scripts resolve stack via `scripts/pulumi-stack.sh` and still document `staging|prod` as valid names.
