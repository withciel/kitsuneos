# WorkOS control plane for KitsuneOS

**Date:** 8 September 2026  
**Status:** Implemented (hosted path)

## Decision

Rely on WorkOS for the human + agent **identity / org / security** plane. Keep Kitsune for the **data plane** (field-level change ops, query-compiler grants, collection audit).

| Concern | Source of truth | Notes |
|---------|-----------------|-------|
| Login / session / MFA | WorkOS AuthKit | `UserSecurity` widget in Settings → Security |
| Workspaces ↔ Orgs | WorkOS Organization (`external_id` = Kitsune workspace UUID) | Provision creates/links org |
| People / invites / roles | WorkOS memberships + invitations | `UsersManagement` widget; mirror principals for grants |
| Agents / AI principals | WorkOS Agent Auth + FGA `agent` resource | Mint short-lived tokens; Kitsune API key as MCP fallback |
| SSO / Directory Sync / Domains | WorkOS Admin Portal + widgets | Settings → Enterprise |
| Audit (security / settings) | WorkOS Audit Logs | `workspace.*`, `agent.created`, `authentication.sso.*` only — **not** collection reads/writes |
| Field/row grants, change sets | Kitsune `grants` + compiler | Non-negotiable PRD DNA |
| Collection / grant denials | Kitsune `kitsune.audit_log` | Immutable data-plane trail |

## FGA resource types (Staging)

```
organization  (system)
└─ agent      (slug: agent) — Kitsune agent principal UUID as external_id
```

Roles: `owner`, `admin`, `member` (org); `agent_admin` with `agent:manage` + `agent:invoke` (resource-scoped).

Permissions for Agent Auth ceiling: `kitsune:propose`, `kitsune:read` (+ `kitsune:write` for admin-granted write).

## App surfaces

- Settings → People: WorkOS `UsersManagement`
- Settings → Security: WorkOS `UserSecurity` (MFA / password)
- Settings → Enterprise: SSO, Directory Sync, domains, audit streaming widgets + Admin Portal links
- `/auth.md` rewrite → AuthKit Agent Registration skill (when `WORKOS_AUTHKIT_DOMAIN` set)
- `POST /api/workos/webhooks` — membership sync
- `POST /api/workos/widget-token` — widget session tokens
- `POST /api/workos/portal` — Admin Portal generate-link

## Explicit non-goals

- Do **not** emit WorkOS audit events for collection CRUD, propose/apply, or grant checks.
- Do **not** express field masks / row predicates in WorkOS FGA — those stay in Kitsune.
