# PRD — End-to-End Notion Clone (Parity Target for KitsuneOS)

**Status:** Draft for build  
**Date:** 6 September 2026  
**Purpose:** Define what an end-to-end Notion clone requires, so KitsuneOS can be gap-analyzed and built toward that surface while keeping Kitsune’s agent-native database engine.  
**Companion:** `docs/gap-analysis-notion-parity.md`

---

## 1. Positioning

**Product:** A collaborative workspace where humans and agents create, organize, and operate **pages** and **databases** under shared permissions.

**Jobs to be done**

1. Capture and edit prose knowledge (docs, wikis, notes).
2. Structure work as databases (tables of pages with properties).
3. Share privately, with people, with teams, or workspace-wide.
4. Operate multiple workspaces (personal + team) from one account.
5. Connect agents and third-party apps that read/write the same data.
6. Navigate knowledge via search, links, and a visual graph.
7. Give agents durable, permission-aware memory over everything they can access.

KitsuneOS already owns (2), (5 partially), and strong change-set/grants primitives. This PRD states full Notion-class product requirements so missing pieces are explicit.

---

## 2. Personas

| Persona | Needs |
|---------|--------|
| Individual | Private pages, personal workspace, fast editor |
| Team member | Shared team spaces, @mentions, comments later |
| Workspace admin | People, teams, access, billing-adjacent settings |
| Agent operator | Agent profiles, scoped API tokens, MCP/API |
| Integration developer | OAuth apps, general CRUD API, webhooks |
| Knowledge worker | Graph view, backlinks, semantic memory retrieval |

---

## 3. Core Ontology

| Concept | Notion analogue | Definition |
|---------|-----------------|------------|
| **Account** | User | Login identity (WorkOS) |
| **Workspace** | Workspace | Tenant boundary; schema + members |
| **Membership** | Workspace member | Account ↔ workspace with role |
| **Team** | Team / group | Named principal for grants & page shares |
| **Page** | Page | Addressable document (title + body + properties) |
| **Database** | Database | Typed collection of pages |
| **Block** | Block | Unit of rich body content (paragraph, heading, list, …) |
| **Share** | Share | ACL on a page (private / people / team / workspace / public link*) |
| **Agent profile** | Custom AI / integration bot | First-class agent principal with identity + tokens |
| **API token** | Integration token | Bearer credential bound to a principal |
| **OAuth application** | Public integration | Third-party client that can create databases and CRUD |
| **Memory corpus** | — / Supermemory | Permission-filtered index agents query as tools |
| **Graph** | Graph / backlinks | Relation + link neighborhood visualization |

\*Public web publish is P2; in-workspace share is P0.

---

## 4. Requirements

### N1 — Multi-workspace accounts (P0)

- A user may belong to **many workspaces** simultaneously.
- Console shows a **workspace switcher** (name, role, create new, open invite).
- Switching updates the active membership pointer; all subsequent UI/API uses that workspace.
- Creating a workspace provisions schema, owner membership, default databases, and a default agent (existing provision path).
- Invites claim into additional memberships without destroying prior ones.

**Acceptance**

- [ ] User in 2+ workspaces can switch without re-login.
- [ ] Create workspace from switcher lands in the new workspace.
- [ ] API list memberships returns all workspaces for the account.

### N2 — Private and shared pages (P0)

- Every page has **visibility**: `private` | `workspace` | `shared`.
- **Private:** only owner (+ workspace admins optional policy) can read/write.
- **Workspace:** all members with collection grants can access (current default).
- **Shared:** explicit ACL rows for people and/or teams with capability `read` | `comment*` | `write` | `full`.
- Sharing **depends on teams**: grant a team principal access to a page (and optionally a whole database).
- Sidebar / search / API **never leak** private pages the caller cannot see.

**Acceptance**

- [ ] New personal page defaults to `private`.
- [ ] Share with teammate or team makes page visible to them only.
- [ ] Collection list filters by page ACL ∪ collection grants.

### N3 — Agent profiles and tokens (P0)

- Users/admins create **named agent profiles** (display name, description, avatar optional, default capability ceiling).
- Each agent is a `principal` kind `agent` with its own grants.
- Operators **mint / rotate / revoke API tokens** per agent (not only one workspace default key).
- Connect settings list agents and show MCP/stdio + remote URL configs per agent token.
- Agents cannot escalate beyond their grants; tokens map 1:1 to that principal.

**Acceptance**

- [ ] Create second agent, mint token, MCP tools run as that principal.
- [ ] Revoking token immediately denies API/MCP.

### N4 — General fetch & change API (P0)

- Stable **REST** (and existing MCP) to:
  - list/get pages & databases
  - query/filter/sort/paginate
  - create/update/delete pages (respecting change-set policy for agents)
  - mutate schema (admin)
- **OAuth applications** (RFC 6749/8252 style for third parties):
  - register app, scopes (`read`, `write`, `schema`, `databases:create`)
  - user authorizes workspace access
  - app can **create databases** and CRUD pages as a `service` principal
- GraphQL remains available; writes may stay REST/MCP-first if documented.

**Acceptance**

- [ ] OAuth client creates a database via API in an authorized workspace.
- [ ] Same client reads/writes pages under granted scopes.

### N5 — WYSIWYG prose editor (P0)

- Full page body uses a **block/rich-text editor** (not a bare textarea).
- Minimum blocks: paragraph, headings, bullets, numbered, todo, code, quote, divider, links.
- Persist as structured JSON (or markdown-compatible AST) in the prose field; export markdown.
- Slash menu for insert; keyboard shortcuts for bold/italic/link.
- Collaborative multiplayer is P2; single-user editor is P0.

**Acceptance**

- [ ] User edits rich body on `/p/[id]` and reloads with formatting intact.
- [ ] Agent reading prose receives markdown or plain text projection.

### N6 — Obsidian-like graph (P1)

- **Graph view** for a workspace (or focused page neighborhood): nodes = pages, edges = relations + wiki-links in prose.
- Pan/zoom, click opens page, filter by database.
- API: expand neighborhood N hops (reuse `listRelated` + link extractor).
- “Graph distribution”: export/sync graph snapshot (JSON) for external tools; optional federation later.

**Acceptance**

- [ ] `/graph` renders interactive neighborhood for current workspace.
- [ ] `GET /api/graph` returns nodes/edges JSON.

### N7 — Supermemory-like agent memory tools (P0)

- MCP/API tools that **search and recall** across all pages/databases the agent can access:
  - `memory_search` — semantic + keyword, grant-aware
  - `memory_get` — fetch page/chunk by id
  - `memory_remember` — optional write of agent notes into an agent-private or shared memory database
  - `memory_related` — graph neighbors for a page
- Scour = continuous/index-backed retrieval, not dumping entire workspace into context.
- Respect page ACL + collection grants; private pages inaccessible to agent stay invisible.

**Acceptance**

- [ ] Agent with limited grants only retrieves permitted chunks.
- [ ] Memory tools return citations (page id, title, snippet).

### N8 — Databases as product + Kitsune-as-database for apps (P0)

- First-party: create databases, properties, table views (existing).
- Third-party OAuth apps treat Kitsune as their **application database**: create collections, insert/update rows, query.
- Document “Kitsune as DB” developer guide (auth, schema, rate limits, webhooks).

---

## 5. Non-goals (this program)

- Full Notion block marketplace / embeds ecosystem.
- Native mobile apps.
- Real-time multiplayer CRDT (P2).
- Board/calendar/timeline database views (table + page first).
- Public internet page publish CDN (P2).
- Replacing Postgres storage with a document store.

---

## 6. Success metrics (predictive)

| Metric | Target |
|--------|--------|
| % users with ≥2 workspace memberships | ≥ 25% by day 60 |
| % pages with non-workspace visibility | ≥ 40% of new pages private or shared |
| Agents with dedicated tokens (not default only) | ≥ 50% of workspaces with ≥1 agent call |
| OAuth app-created databases | ≥ 10 design-partner apps |
| Memory tool calls / agent session | ≥ 3 median |

---

## 7. Phased delivery

| Phase | Ships |
|-------|-------|
| **A** | Multi-workspace switcher + create; page visibility + team/people shares; agent profiles + tokens |
| **B** | WYSIWYG editor; memory MCP tools; OAuth apps create databases |
| **C** | Graph UI + graph API distribution; deeper Notion API shape aliases |

---

## 8. Open questions

1. Should workspace admins always see private pages? (Default proposal: **yes**, with audit.)
2. Are wiki-links `[[Page]]` in prose enough for graph edges, or only typed relations?
3. Should `memory_remember` write to a system `Agent Memory` database or a hidden store?
