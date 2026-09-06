# Gap Analysis — Notion Clone PRD vs KitsuneOS

**Date:** 6 September 2026  
**Sources:** `docs/prd-notion-clone.md`, `docs/prd.md`, `docs/system-design.md`, codebase inventory  
**Rule:** System Design / existing Kitsune PRD wins on engine constraints; Notion Clone PRD wins on missing *product* surfaces we now choose to build.

---

## 1. Strategic comparison

| Dimension | Notion | KitsuneOS today | Verdict |
|-----------|--------|-----------------|---------|
| Primary noun | Page / block | Record-as-page in typed collection | Close IA; weaker wiki/share |
| Data model | Soft properties + blocks | Relational collections + field grants + change sets | Kitsune stronger for agents/DB |
| AuthZ | Page ACL + workspace | Collection grants + teams; weak page ACL | **Gap** |
| Multi-workspace | First-class switcher | Memberships in DB; no switcher UX | **Gap** |
| Agents | Integrations / AI | MCP + default agent key | Partial — need profiles |
| API | Notion Public API | REST + MCP + read GraphQL | Strong; need OAuth apps |
| Editor | Blocks WYSIWYG | Prose textarea | **Gap** |
| Graph | Limited | Relation neighbors API only | **Gap** UI |
| Memory | AI connectors | Grant-aware `search` | Need Supermemory-shaped tools |

Kitsune should **not** abandon change sets / field grants. Extend them with Notion-class sharing, editor, multi-ws, agents, OAuth, graph, and memory tools.

---

## 2. Requirement matrix

| ID | Requirement | Kitsune today | Gap | Status |
|----|-------------|---------------|-----|--------|
| N1 | Multi-workspace membership + switcher | Memberships + `users.workspace_id`; switcher + create/switch APIs | — | **Shipped** |
| N2 | Private / shared pages + team shares | `page_access` / `page_shares`; enforced in query/read/search; Share dialog | — | **Shipped** |
| N3 | Agent profiles + API tokens | `/api/agents` + Connect Agents panel; per-agent keys; `agent_memory` grant | — | **Shipped** |
| N4 | General fetch/change API | REST (`/api/query`, `/api/records`, …) + MCP; **Bearer API key + OAuth** on data routes | — | **Shipped** |
| N4b | OAuth apps create databases | `oauth_apps` + `/api/oauth/apps` + `/api/oauth/token` + `databases:create` | — | **Shipped** |
| N5 | WYSIWYG prose | TipTap `ProseEditor` on prose fields | — | **Shipped** |
| N6 | Obsidian-like graph | `/graph` UI + `/api/graph` distribution JSON | Link extraction from prose still shallow | **MVP shipped** |
| N7 | Supermemory-like tools | MCP `memory_search|get|related|remember` over grant-visible pages | — | **Shipped** |
| N8 | Kitsune-as-database for apps | OAuth service principal + `POST /api/collections` with bearer token | Full OAuth authorize UI (auth code) deferred | **MVP shipped** |

---

## 3. What we keep (non-negotiable)

From existing Kitsune PRD / system design — still binding:

- Field-level change ops with base revision / change sets for agents.
- Single authorization path through the query compiler (extend predicates for page ACL).
- No `SELECT *`; compiled row predicates.
- Agents as first-class principals; propose ceiling unless admin grants write.
- Postgres schema-per-workspace tenancy.

Page ACL and agent tokens must compile into the **same** grant/query path, not a second ad-hoc filter in the Next.js app only.

---

## 4. Implementation plan (this branch)

### Phase A — Foundations (this iteration)

1. **Workspaces API + switcher**
   - `GET /api/workspaces` — memberships for current user
   - `POST /api/workspaces` — create additional workspace (provision)
   - `POST /api/workspaces/switch` — set active `users.workspace_id` / `principal_id`
   - Sidebar workspace switcher component

2. **Page visibility + shares**
   - Migration: `visibility` on pages metadata table **or** side table `kitsune.page_acl` keyed by `(workspace_id, collection, record_id)`
   - Prefer control-plane table to avoid per-collection DDL churn:
     `kitsune.page_access (workspace_id, collection_id, record_id, visibility, owner_principal_id)`
     `kitsune.page_shares (…, grantee_principal_id, capability)`
   - Enforce in list/get/search SQL helpers
   - UI: Share dialog on page (Private / Workspace / People / Teams)

3. **Agent profiles**
   - `GET/POST /api/agents`, `POST /api/agents/[id]/tokens`
   - Settings → Agents UI
   - Bind API keys to agent principal (existing `api_keys` table)

### Phase B — Editor, memory, OAuth

4. TipTap editor for prose fields on `/p/[id]`
5. MCP tools `memory_search`, `memory_get`, `memory_related`, `memory_remember`
6. OAuth application tables + authorize + token + create database scope

### Phase C — Graph

7. `/graph` force-directed view + `GET /api/graph`

---

## 5. Evidence of current gaps (code)

| Area | Evidence |
|------|----------|
| No switcher | No matches for `WorkspaceSwitcher` / `switchWorkspace` under `apps/app` |
| Memberships exist | `packages/core/src/org/memberships.ts`, migration `workspace_memberships` |
| Active WS = user pointer | `apps/app/src/lib/require-workspace.ts` `pickMembership` |
| Editor | Prose → textarea (`field-control` / page view) |
| Graph UI | Spec: list links only; acceptance `search-graph` tests API neighbors |
| OAuth apps | No app registry for third-party DB creation |

---

## 6. Definition of done for the goal

Goal is complete when:

1. PRD + this gap doc are in `docs/`.
2. N1–N3, N5, N7, N4b/N8 are implemented with tests or manual verification evidence.
3. N6 graph UI + API at least MVP.
4. Gap matrix rows for those IDs read **shipped** or **MVP shipped** with file references.

Until then the goal stays open.
