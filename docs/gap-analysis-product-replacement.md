# Gap Analysis — KitsuneOS as Replacement for Knowledge / CMS / Memory Tools

**Date:** 6 September 2026  
**Goal:** KitsuneOS should be able to replace the need for Notion, Obsidian, headless CMS, notes apps, Supermemory, and adjacent knowledge tools — without abandoning Kitsune DNA (field-level change ops, compiler authz, agents as principals, schema-per-workspace).

**Method:** Dual-agent loop — planner maps categories → ranked backlog; implementer closes gaps; deploy when coverage is credible.

---

## 1. Category coverage matrix

| Category | Must-haves | Kitsune today | Priority gaps |
|----------|------------|---------------|---------------|
| **Notion** | Multi-ws, private/shared pages, DBs+pages, rich editor, search, API/agents | Switcher, page ACL, TipTap, REST/MCP/OAuth, agents, ⌘K, Notes | Slash/block editor depth; comments; compiler-level ACL |
| **Obsidian** | Markdown notes, `[[wiki-links]]`, backlinks, graph, import | Graph MVP (relations), Notes DB, CLI md ingest | Wiki-link parse/edges; backlinks panel; vault import UI |
| **Headless CMS** | Content models, draft/publish, CRUD API, webhooks, media | Typed collections, change sets, engine webhooks/attachments | Publish lifecycle UX; webhook console; media library UI |
| **Notes apps** | Instant capture, folders/tags, search, simple editor | Notes collection, private-by-default, ⌘K New note | Tags polish; mobile |
| **Supermemory** | Grant-aware search/get/related/remember | MCP `memory_*` + page ACL post-filter | Compiler ACL in search; human memory UI (⌘K covers part) |
| **Adjacent** | Wiki tree, Airtable views, Linear-lite | CRM seed, relations/rollups | Boards/calendars deferred |

---

## 2. Ranked backlog (this push)

| # | Item | Status |
|---|------|--------|
| 1 | Compile page ACL into query path (DNA) | Post-filter solid; compiler TODO remains |
| 2 | Personal `notes` + default-private create | **Shipped** |
| 3 | Global capture + search palette (⌘K) | **Shipped** |
| 4 | Wiki-links, backlinks, graph edges from prose | **Shipped** |
| 5 | Editor slash/block parity | **Shipped** (slash menu MVP) |
| 6 | CMS publish lifecycle (`draft`/`published`) | **Shipped** |
| 7 | Media library UI on pages | **Shipped** |
| 8 | Webhooks settings console | **Shipped** |
| 9 | Markdown vault import/export in Connect | Pending |
| 10 | Remote MCP Streamable HTTP honesty | Partial (prior work) |
| 11 | OAuth authorization-code UI | Deferred (client_credentials MVP exists) |
| 12 | Backlinks chrome on page | **Shipped** |

---

## 3. Explicitly out of scope now

- Local-first Obsidian vault sync / FUSE  
- Real-time CRDT multiplayer  
- Board/calendar/timeline DB views  
- Public anonymous page CDN  
- Native mobile  
- Full Linear product  
- Second search stack (Pinecone)

---

## 4. Deploy checklist (when backlog MVP lands)

1. Control-plane migrate (page ACL, oauth, any link-index tables).  
2. `SKIP_LOCAL_MIGRATE=1 ./scripts/deploy-all.sh` (or site+app).  
3. Health check live app URL.  
4. Smoke: Notes private → ⌘K → share → graph wiki edge → MCP memory cannot see private → webhook/media if shipped.

**Live (2026-09-06):** Marketing site HTTP 200; app `/health` returns `{"ok":true}` after App Runner roll of image `6de1697`. P0–P1 UI gaps (#2–#8, #12) shipped on this branch; #1 compiler ACL and #9–#11 remain deferred.

**Open free tier (follow-up):** Signup is open via WorkOS AuthKit (no waitlist). Free plan enforces caps (1 workspace, 5 agents, 5 people, 15 databases, 100 MB storage, 250 MCP ops/day). Pro via Dodo Payments lifts caps; Settings → Billing shows usage and upgrade.
