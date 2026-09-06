# KitsuneOS MCP — stdio (Node) + remote Streamable HTTP with OAuth

**Status:** Implemented (Phases 0–5 engineering complete; marketplace submissions ops-gated)  
**Date:** 6 September 2026  
**Owner:** Platform  
**Companions:** [PRD R5](../../prd.md), [system-design § MCP](../../system-design.md), [MCP build server (TypeScript)](https://modelcontextprotocol.io/docs/2026-07-28/develop/build-server#typescript), [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), [Claude custom connectors](https://support.anthropic.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp)

---

## 1. Problem

KitsuneOS today has two surfaces that are easy to confuse:

| Surface | Speaks | Works with |
|---|---|---|
| `packages/mcp` stdio (`node …/stdio.js`) | Real MCP JSON-RPC over stdio | Claude Desktop **local**, Cursor **command** config |
| `GET /api/mcp/tools` + `POST /api/mcp/tools/call` | Custom REST | curl / scripts only |

The Connect settings UI pastes the **REST** URL into Cursor and Claude Desktop configs. Those clients expect real MCP:

- Cursor remote `url` → Streamable HTTP (`initialize`, `tools/list`, `tools/call`)
- Claude Desktop `claude_desktop_config.json` → stdio `command` / `args` / `env` (or Custom Connectors for remote)
- Claude Web Custom Connectors → public HTTPS Streamable HTTP + **OAuth 2.1**

Observed Cursor failure: POSTing `initialize` to `/api/mcp/tools` returns **405**. Logs look like `mcp-server-user-kitsuneos.workspaceId-empty-window` (Cursor’s internal id for a user MCP named `kitsuneos` in an empty window — not a missing Kitsune workspace UUID).

**Goal of this plan:** ship both a first-class **Node/stdio client path** and a **remote MCP server with OAuth**, so Claude Desktop, Claude Web, and Cursor all connect without protocol hacks.

---

## 2. Goals and non-goals

### Goals

1. **Node / stdio MCP** — documented, Connect-UI-correct, works offline against local or remote Postgres with env credentials.
2. **Remote MCP** — single public Streamable HTTP endpoint, e.g. `https://$APP_HOST/api/mcp`.
3. **OAuth 2.1 + PKCE** for Claude Web / Desktop Custom Connectors (resource server + authorization server discovery).
4. **Shared tool layer** — one `TOOL_DEFINITIONS` + `invokeMcpTool` for stdio and HTTP; grants unchanged.
5. **Honest Connect UI** — separate snippets for stdio vs remote vs legacy REST.
6. **Keep API-key Bearer** on the remote endpoint for Cursor / CI / scripts (secondary to OAuth).
7. **Marketplace readiness** — checklist to publish KitsuneOS on ChatGPT, Claude, Cursor, and Grok surfaces once remote MCP + OAuth exist (see §12).

### Non-goals (this plan)

- MCP Resources / Prompts / Sampling (tools only for v1 of remote).
- Submitting marketplace applications before Phases 2–3 land (prep + Phase 5 only after remote MCP + OAuth work).
- Replacing GraphQL / REST.
- Metering redesign (reuse existing API-key / usage events).
- Paying for featured / partner placements (track as ops follow-up after Phase 5 self-serve listings).

---

## 3. Target architecture

```text
┌──────────────────────────┐     stdio JSON-RPC      ┌─────────────────────────────┐
│ Claude Desktop (local)   │ ◄─────────────────────► │ packages/mcp stdio entry    │
│ Cursor (command config)  │                         │ Node client / local server  │
└──────────────────────────┘                         └──────────────┬──────────────┘
                                                                    │
                                                         createKitsuneMcpServer()
                                                         TOOL_DEFINITIONS
                                                         invokeMcpTool
                                                                    │
┌──────────────────────────┐  Streamable HTTP + OAuth  ┌────────────┴──────────────┐
│ Claude Web Connectors    │ ◄───────────────────────► │ POST/GET /api/mcp          │
│ Claude Desktop Connectors│   (Anthropic cloud → us)  │ StreamableHTTP transport   │
│ Cursor (url config)      │   (+ Bearer API key OK)   │ Auth → workspace/principal │
└──────────────────────────┘                           └────────────────────────────┘
                                                                    │
                                                                    ▼
                                                           KitsuneEngine + grants
```

**Auth resolution on `/api/mcp` (order):**

1. `Authorization: Bearer <oauth-access-token>` → map to principal + workspace  
2. `Authorization: Bearer kso_live_|kso_test_…` → existing API-key resolution  
3. Else → `401` + `WWW-Authenticate` (OAuth challenge once AS is live)

**Legacy REST** (`/api/mcp/tools`, `/api/mcp/tools/call`) stays until deprecation (Phase 4).

---

## 4. Client matrix (what we ship configs for)

| Client | Transport | Auth | Config location |
|---|---|---|---|
| Claude Desktop (local) | stdio Node | Env: `KITSUNE_WORKSPACE_ID`, `KITSUNE_PRINCIPAL_ID`, DB URLs | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (remote) | Custom Connector → Streamable HTTP | OAuth 2.1 + PKCE | Claude → Settings → Connectors |
| Claude Web | Custom Connector → Streamable HTTP | OAuth 2.1 + PKCE | claude.ai → Customize → Connectors |
| Cursor (local) | stdio Node | Same env as Desktop | `~/.cursor/mcp.json` `command`/`args`/`env` |
| Cursor (remote) | Streamable HTTP `url` | Bearer API key (Phase 2) or OAuth (Phase 3) | `~/.cursor/mcp.json` `url`/`headers` |
| Scripts / curl | Legacy REST (then MCP HTTP) | API key | — |

---

## 5. Phase plan

### Phase 0 — Stop shipping broken configs (1 small PR)

**Why:** Users are already pasting invalid Claude/Cursor JSON from Connect.

1. Split Connect UI into tabs/snippets:
   - **Claude Desktop (local) / Cursor (local):** stdio `command` + `args` + `env`
   - **Cursor (remote):** only after Phase 2 URL exists; until then show “coming soon / use stdio”
   - **Claude Web:** “requires remote OAuth MCP (Phase 3)”
   - **HTTP / curl:** label clearly as **REST, not MCP**
2. Never emit `{ url, headers }` as a Claude Desktop config.
3. Short troubleshooting note: Cursor log id `mcp-server-user-kitsuneos.workspaceId-empty-window` ≠ missing Kitsune workspace id; open a folder + fix protocol.

**Exit:** Connect UI cannot generate a config Claude Desktop rejects as invalid for the reason “url is not allowed.”

---

### Phase 1 — Harden the Node / stdio client path

**Why:** This is the supported path for Claude Desktop local and Cursor without remote protocol work.

1. Keep / polish `packages/mcp` stdio entry (`node dist/stdio.js` or package bin).
2. Prefer modern SDK shape where practical (`McpServer` + `registerTool` per [TS guide](https://modelcontextprotocol.io/docs/2026-07-28/develop/build-server#typescript)), without breaking invoke layer.
3. Extract `createKitsuneMcpServer({ getContext })` used by stdio **and** later HTTP.
4. `pnpm quickstart` continues to print a ready-made stdio block with absolute path.
5. Optional package bin: `"bin": { "kitsuneos-mcp": "./dist/stdio.js" }` so configs can use `npx`/`pnpm exec` instead of brittle absolute paths (nice-to-have).
6. Acceptance: list tools + `describe_schema` over stdio in CI (or existing MCP acceptance coverage).

**Example Claude Desktop / Cursor stdio config:**

```json
{
  "mcpServers": {
    "kitsuneos": {
      "command": "node",
      "args": ["/absolute/path/to/kitsuneos/packages/mcp/dist/stdio.js"],
      "env": {
        "KITSUNE_WORKSPACE_ID": "<uuid>",
        "KITSUNE_PRINCIPAL_ID": "<uuid>",
        "KITSUNE_APP_URL": "postgresql://…",
        "KITSUNE_OWNER_URL": "postgresql://…"
      }
    }
  }
}
```

**Exit:** Documented stdio path works on Claude Desktop and Cursor; Connect UI copies this for “local” guides.

---

### Phase 2 — Remote Streamable HTTP MCP endpoint (no OAuth yet)

**Why:** Unblocks Cursor `url` config and proves protocol before OAuth complexity.

1. Add hosted route **`/api/mcp`** (single endpoint, `GET` + `POST`).
2. Use SDK Streamable HTTP transport (`StreamableHTTPServerTransport` or Web-standard adapter compatible with Next.js App Router).
3. Implement MCP lifecycle:
   - `initialize` / `notifications/initialized`
   - `tools/list` → `TOOL_DEFINITIONS`
   - `tools/call` → `invokeMcpTool`
4. Security baseline:
   - Validate `Origin` when present (403 if invalid)
   - Require Bearer API key until Phase 3
   - Optional `MCP-Session-Id` if transport is stateful; prefer short-lived / stateless if tools are request/response only
5. Middleware: ensure `/api/mcp` is reachable with API key (same bypass pattern as today’s `/api/mcp/tools*`).
6. Tests:
   - initialize → capabilities include tools
   - tools/list matches definitions
   - tools/call with valid key
   - cross-workspace isolation
   - POST initialize to old `/api/mcp/tools` still 405 (legacy unchanged)
7. Connect UI: Cursor remote snippet points at `https://$APP_HOST/api/mcp` + `Authorization: Bearer …`.

**Exit:** MCP Inspector and Cursor remote `url` can complete `initialize` and call a tool with an API key.

---

### Phase 3 — OAuth 2.1 for Claude Web / Desktop Connectors

**Why:** Claude Custom Connectors are brokered from Anthropic’s cloud and expect OAuth consent, not pasted API keys ([Anthropic help](https://support.anthropic.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp)). Spec: MCP server is a **resource server**; AS is discovered via Protected Resource Metadata.

#### 3.1 Authorization design

1. Publish **Protected Resource Metadata**:  
   `https://$APP_HOST/.well-known/oauth-protected-resource`  
   advertising the authorization server and resource (`https://$APP_HOST/api/mcp`).
2. **AS decision (spike first):**
   - **Preferred:** WorkOS / AuthKit issues MCP-scoped tokens (PKCE, resource indicators RFC 8707).
   - **Fallback:** Embedded MCP OAuth provider that federates login to WorkOS, then mints MCP access tokens bound to Kitsune principal + workspace.
3. Unauthenticated MCP requests return `401` with `WWW-Authenticate` pointing at discovery.
4. Access token → resolve `{ workspaceId, principalId }` into the same grant path as API keys.
5. Scopes (v1):
   - `mcp:tools` — list + call tools under grants (default)
   - Later: `mcp:read` / `mcp:propose` / `mcp:admin` if we need finer connector consent
6. Consent screen: “Claude wants to use KitsuneOS as {principal} in {workspace}.”
7. Revocation: disconnect in Claude + revoke token / rotate refresh in KitsuneOS settings.

#### 3.2 Claude Web / Desktop Connectors UX

1. Connect UI instructions:
   - Add custom connector  
   - URL: `https://$APP_HOST/api/mcp`  
   - Complete OAuth  
   - Enable tools per conversation
2. Network note: Anthropic egress must reach the public URL (no VPN-only hosts).
3. Manual QA on Free/Pro and Team Owner → member connect flows.

**Exit:** Add connector on claude.ai, OAuth completes, tools appear, `describe_schema` (or equivalent) succeeds; writes still respect grants / Inbox propose path.

---

### Phase 4 — Polish and deprecation

1. Deprecate REST `/api/mcp/tools` and `/api/mcp/tools/call` (Sunset header + docs; remove after one release).
2. Default connector principals to **propose-only** for mutating tools where product policy requires Inbox review.
3. Audit + rate-limit OAuth sessions separately from API-key buckets if needed.
4. Rotate any keys pasted into chats; Connect UI shows plaintext key once then masks.
5. Client ID Metadata Documents if AS policy requires `2026-07-28` client identity.

---

### Phase 5 — Marketplace publishing (ChatGPT, Claude, Cursor, Grok)

**Why:** After Phases 2–3, KitsuneOS can connect manually; Phase 5 is distribution — one-click discovery in each host’s catalog. Detail, assets, and gap matrix live in **§12**; this phase is the execution checklist.

**Shared prep (do once before any submission)**

- [ ] Tool annotations complete for every tool (`title` / `readOnlyHint` / `destructiveHint` / `openWorldHint` as required)
- [ ] Privacy, ToS, support URL, logo, company site ready for listing forms
- [ ] Seeded reviewer demo workspace (no signup / no inaccessible 2FA)
- [ ] Publish to **official MCP Registry** (`server.json` with `remotes[]` + npm stdio `packages`) via `mcp-publisher`

**5a — ChatGPT (OpenAI Apps SDK / Plugins)**

- [ ] OpenAI org identity verification (Owner or `api.apps.write`)
- [ ] Domain challenge: `GET /.well-known/openai-apps-challenge` on MCP host root (plain text)
- [ ] Attach production MCP + OAuth; run **Scan Tools**; write ~5 positive / ~3 negative test prompts
- [ ] CSP allowlist if any app UI fetches origins
- [ ] Submit → review → manually **Publish** (Codex plugin may be created from approved app)

**5b — Claude (Connectors Directory)**

- [ ] Anthropic **Team or Enterprise** org + Directory submit permission
- [ ] Custom-connector QA on claude.ai first (paste URL + OAuth)
- [ ] Portal listing copy (tagline ≤55, description ≤2000, categories, prerequisites)
- [ ] Submit remote MCP in org admin Connectors Directory portal
- [ ] Optional later: MCPB desktop extension for offline Claude Desktop

**5c — Cursor (Marketplace + cursor.directory)**

- [ ] Public open-source plugin repo with `.cursor-plugin/plugin.json` + `mcp.json` → remote MCP
- [ ] Local test from `~/.cursor/plugins/local/<name>`
- [ ] Submit at https://cursor.com/marketplace/publish (manual review; email follow-up)
- [ ] Mirror listing on cursor.directory (separate queue — does not auto-list officially)

**5d — Grok / xAI (Connectors + Build catalog)**

- [ ] Docs for Grok **Custom** connector (paste MCP URL + OAuth)
- [ ] Optional featured listing via xAI partnership (not self-serve)
- [ ] Optional Grok Build plugin repo; PR into `xai-org/plugin-marketplace` with SHA-pinned `.grok-plugin/marketplace.json` entry + `scripts/generate-plugin-index.py` / `validate-catalog.py`

**Suggested submit order:** MCP Registry → Claude Directory → Cursor Marketplace → ChatGPT Apps → Grok Custom docs / Build PR → featured/partner outreach.

**Exit:** At least one remote directory listing live (Claude or ChatGPT) **or** Cursor Marketplace approved; MCP Registry entry published; Connect UI links to install docs for each host.

---

## 6. Implementation sketch

### Shared server factory

```text
packages/mcp/src/
  create-server.ts   # McpServer + registerTool(*) → invokeMcpTool
  stdio.ts           # StdioServerTransport + env context
  http.ts            # helpers for Streamable HTTP / fetch adapter
  schemas.ts         # TOOL_DEFINITIONS (unchanged contract)
  invoke.ts          # invokeMcpTool (unchanged)
```

### Hosted remote route

```text
apps/app/src/app/api/mcp/route.ts
  export async function GET(req: Request)  { … transport … }
  export async function POST(req: Request) { … transport … }
  export async function DELETE(req: Request) { … optional session end … }
```

### OAuth / discovery (Phase 3)

```text
apps/app/src/app/.well-known/oauth-protected-resource/route.ts
apps/app/src/lib/mcp-oauth.ts          # token validate, audience check
# plus AS routes or WorkOS integration as chosen in spike
```

### Connect UI

```text
apps/app/src/app/(workspace)/settings/connect/page.tsx
  guides: local-stdio | cursor-remote | claude-connectors | rest-legacy
```

---

## 7. Testing strategy

| Layer | Cases |
|---|---|
| Unit | Tool registration; auth resolver order; Origin reject |
| Acceptance | Stdio smoke; Streamable HTTP initialize/list/call; API-key isolation |
| OAuth | Discovery document; 401 challenge; happy-path token; expired/revoked token; wrong audience |
| Manual | Claude Desktop stdio; Cursor url; Claude.ai connector OAuth; empty Cursor window does not confuse support |

Do not claim Claude Web support until Phase 3 manual proof exists.

---

## 8. Success criteria

- [x] Claude Desktop local: stdio config from Connect works after restart; tools visible.
- [x] Cursor local: same stdio config works with a folder open.
- [x] Cursor remote: `url: https://$APP_HOST/api/mcp` completes initialize (API key).
- [x] Claude Web + Desktop Connectors: OAuth to same URL; tools list; schema tool succeeds.
- [x] Grants/Inbox behavior unchanged vs today’s MCP tool semantics.
- [x] Connect UI never presents REST `/api/mcp/tools` as Claude Desktop MCP config.
- [x] Legacy REST still works until Phase 4 sunset (Deprecation/Sunset headers).

---

## 9. Risks and decisions

| Risk | Mitigation |
|---|---|
| Next.js App Router + SSE/streaming friction | Prefer SDK Web Standard transport; fallback: small Node sidecar on App Runner only for `/api/mcp` |
| WorkOS may not be a full MCP AS | Phase 3 spike first; embedded AS + WorkOS login fallback |
| Spec drift (`2025-11-25` vs `2026-07-28`) | Ship Streamable HTTP + OAuth 2.1 PKCE now; add Client ID Metadata when required |
| Over-permissioned connectors | Propose-only default for mutating tools; explicit upgrade |
| Users confuse Cursor empty-window ids with Kitsune workspace ids | Phase 0 troubleshooting copy |

**Open decision (block Phase 3 build, not Phase 2):** WorkOS-as-AS vs embedded AS federating to WorkOS.

---

## 10. Suggested PR sequence

1. **PR-A (Phase 0):** Connect UI / docs honesty  
2. **PR-B (Phase 1):** `createKitsuneMcpServer` + stdio polish + Connect local snippets  
3. **PR-C (Phase 2):** `/api/mcp` Streamable HTTP + acceptance + Cursor remote snippet  
4. **PR-D (Phase 3 spike):** AS choice write-up + discovery prototype  
5. **PR-E (Phase 3):** OAuth + Claude connector QA  
6. **PR-F (Phase 4):** Deprecate REST + hardening  
7. **PR-G (Phase 5):** Marketplace packaging + submissions — MCP Registry, Claude Directory, Cursor plugin, OpenAI Apps/Plugins, Grok Custom docs + Build catalog PR (see Phase 5 + §12)

---

## 11. References (external)

- Build an MCP server (TypeScript): https://modelcontextprotocol.io/docs/2026-07-28/develop/build-server#typescript  
- Connect to remote MCP servers: https://modelcontextprotocol.io/docs/2026-07-28/develop/connect-remote-servers  
- Streamable HTTP transport: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports  
- Authorization: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization  
- Claude custom connectors (remote MCP): https://support.anthropic.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp  
- Claude Connectors Directory submission: https://claude.com/docs/connectors/building/submission  
- Anthropic Software Directory Policy: https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy  
- OpenAI Apps SDK submission: https://developers.openai.com/apps-sdk/deploy/submission  
- OpenAI app submission guidelines: https://developers.openai.com/apps-sdk/app-submission-guidelines  
- OpenAI MCP / plugin review requirements: https://developers.openai.com/plugins/deploy/app-review  
- Cursor plugins reference: https://cursor.com/docs/reference/plugins · publish: https://cursor.com/marketplace/publish  
- Official MCP Registry publishing: https://modelcontextprotocol.io/registry · `mcp-publisher` CLI  
- Grok connectors: https://docs.x.ai/docs/guides/connectors (or https://docs.x.ai/grok/connectors)  
- Grok Build plugin marketplace (index PR): https://github.com/xai-org/plugin-marketplace · https://x.ai/news/grok-plugin-marketplace  

---

## 12. Marketplace publishing — ChatGPT, Claude, Cursor, Grok

Publishing “as an app” is **not one process**. Each host has a different product surface, auth bar, and review path. Shared technical prerequisite for almost all of them: **Phases 2–3** (public Streamable HTTP MCP + OAuth 2.1 PKCE + tool annotations).

```text
                    ┌─────────────────────────────┐
                    │ KitsuneOS Streamable HTTP   │
                    │ https://app…/api/mcp        │
                    │ + OAuth 2.1 + tool hints    │
                    └──────────────┬──────────────┘
           ┌──────────────┬───────┴────────┬──────────────┐
           ▼              ▼                ▼              ▼
      ChatGPT Apps   Claude Directory  Cursor Marketplace  Grok
      / Plugins      + custom connector + cursor.directory  Connectors
                                                           + Build catalog
           │              │                │              │
           └──────────────┴────────┬───────┴──────────────┘
                                   ▼
                    Official MCP Registry (server.json)
                    amplifies discovery in community dirs
```

### 12.1 Shared prerequisites (do once)

| Prerequisite | Why |
|---|---|
| Public HTTPS Streamable HTTP endpoint | Every remote marketplace / connector rejects local stdio and custom REST |
| OAuth 2.1 + PKCE + Protected Resource Metadata | Required for Claude Directory and ChatGPT authenticated apps; expected by Grok custom connectors; best practice for Cursor remote |
| Accurate tool annotations | OpenAI: `annotations.readOnlyHint` / `destructiveHint` / `openWorldHint` + written justifications; Claude: `title` + `readOnlyHint` / `destructiveHint` |
| Privacy policy, ToS, support URL, logo, company site | Listing fields across OpenAI, Claude, Cursor |
| Demo / reviewer account with seeded data | OpenAI and Claude reviews need end-to-end login without signup/2FA blockers |
| Domain verification where required | OpenAI root `GET /.well-known/openai-apps-challenge` (plain text; path-stripped — host on apex/parent of MCP host); MCP Registry namespace ownership |
| Official MCP Registry `server.json` with `remotes[]` | Feeds Glama / mcp.directory / similar crawlers; dual-publish stdio `packages` + remote via `mcp-publisher` |

Also publish **both** install modes in the registry when ready:

```json
{
  "name": "com.kitsuneos/kitsuneos",
  "title": "KitsuneOS",
  "description": "Application database for humans and agents — grants, change sets, Inbox.",
  "version": "1.0.0",
  "remotes": [
    {
      "type": "streamable-http",
      "url": "https://$APP_HOST/api/mcp"
    }
  ],
  "packages": [
    {
      "registryType": "npm",
      "identifier": "@kitsuneos/mcp",
      "version": "1.0.0",
      "transport": { "type": "stdio" }
    }
  ]
}
```

### 12.2 ChatGPT (OpenAI Apps SDK / Plugins directory)

**Surfaces:** ChatGPT Apps (Apps SDK) and/or Codex/ChatGPT **Plugins with MCP**. Public listing goes through OpenAI Platform review, not a paste-a-URL DIY store. Approved Apps can also produce a Codex plugin distribution.

**What to build / prepare**

1. Production MCP URL (Universal preferred; Template/tenant URLs only when OpenAI has approved that pattern — otherwise reject risk).
2. Verified individual/business identity in OpenAI Platform (Settings → Organization); Owner or `api.apps.write` to submit (`api.apps.read` can view status).
3. Domain verification: serve the challenge token as **plain text** at `GET /.well-known/openai-apps-challenge` on the **root** of the MCP hostname or an allowed parent (subpath-hosted challenge URLs are not supported).
4. Auth: OAuth credentials for reviewers; **fully featured demo account** with sample data (no mandatory signup / inaccessible 2FA).
5. Every tool annotated in the MCP `annotations` object: `readOnlyHint`, `destructiveHint`, `openWorldHint` + written justifications that match the advertised values; run dashboard **Scan Tools** before submit.
6. CSP allowlist required if any UI component fetches origins (submission blocker when missing).
7. Listing assets: name, short/long description, logo, category, website, support URL, privacy URL, terms URL, screenshots/demo, **~5 positive + ~3 negative** test prompts/responses, release notes, localization / country availability.
8. Policy: usage policies, all-audiences appropriateness, privacy minimization; no unofficial pass-through to third-party APIs you don’t control.

**Submit:** OpenAI Platform Dashboard → create draft → attach MCP + OAuth → Scan Tools → Submit for review → after approval, manually **Publish** (and optionally Codex plugin is created from the approved app).

**Docs:** https://developers.openai.com/apps-sdk/deploy/submission · https://developers.openai.com/plugins/deploy/app-review · https://developers.openai.com/apps-sdk/app-submission-guidelines

**KitsuneOS work items**

- [ ] Add OpenAI domain-challenge route on `app.kitsuneos.com` (or marketing apex if that is the verified parent)
- [ ] Expand tool annotations to OpenAI’s three hints + justifications metadata
- [ ] Seed a durable `reviewer@kitsuneos.com`-style demo workspace
- [ ] Record demo video + write 5/3 test prompts
- [ ] Legal pages linked from listing (privacy / terms already exist — verify they’re complete enough)
- [ ] Complete OpenAI org identity verification before first submit

### 12.3 Claude (Custom Connectors + Connectors Directory)

**Two tiers**

| Tier | Who | Auth | Discoverability |
|---|---|---|---|
| Custom connector | Any paid Claude user pastes URL | OAuth (API keys not enough for hosted Claude) | Manual only |
| Connectors Directory | Anthropic review (community → may later become verified) | OAuth 2.0 for authenticated remote services | One-click across Claude.ai / Desktop / Mobile / Code / Cowork |

**Directory access bar:** **Team or Enterprise** org on Claude.ai (individual plans lack the admin portal). Owners / Primary owners submit by default; Enterprise can grant Directory or Libraries permission via custom roles.

**Requirements (remote MCP)**

1. Streamable HTTP over `https://` (SSE tolerated temporarily; Anthropic policy says it will be deprecated)
2. Tool `title` + applicable `readOnlyHint` / `destructiveHint` on every tool (names ≤64 chars recommended for Claude)
3. OAuth for authenticated services (dynamic client registration, client ID metadata documents, or Anthropic-held static client — select in portal)
4. `401` + `WWW-Authenticate` / Protected Resource Metadata discovery contract
5. Docs URL, privacy policy URL, support contact, icon, categories, use cases; name ≤100 / tagline ≤55 / description ≤2000
6. Reviewer test account with full populate instructions (MCP Inspector or custom connector self-test before submit)
7. Portal compliance acknowledgments (directory guidelines, API ownership, etc.)
8. Optional: allowed link URIs for `ui/open-link` (origins you own only)
9. MCP Apps (interactive UI) additionally need 3–5 PNG carousel screenshots ≥1000px wide (app response only; paired prompts)

**Desktop alternative:** package local stdio as **MCPB / desktop extension** via separate form (not the remote portal). Privacy policy required in README + `privacy_policies` in manifest for local packages.

**Policy:** Anthropic Software Directory Policy + Terms — endpoint ownership, graceful errors, tool annotations, OAuth with public CA certs for remote authenticated servers.

**Docs:** https://claude.com/docs/connectors/building/submission · https://claude.com/docs/connectors/directory · https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy  
**Escalations:** `mcp-review@anthropic.com`

**KitsuneOS work items**

- [ ] Ensure Anthropic Team/Enterprise org exists for Ciel / KitsuneOS
- [ ] Align OAuth discovery with Claude’s expected RFCs (resource metadata, PKCE S256, resource indicator)
- [ ] Tool titles + readOnly/destructive hints on all MCP tools
- [ ] Prep portal copy (tagline ≤55 chars, description ≤2000, categories, prerequisites)
- [ ] Submit remote listing after Phase 3; optionally MCPB later for offline Desktop

### 12.4 Cursor (Marketplace + community)

**Two distribution channels**

| Channel | Install UX | Review | Notes |
|---|---|---|---|
| Official Cursor Marketplace | One-click in Customize | Manual review; updates re-reviewed; follow-up via email (no public status UI) | https://cursor.com/marketplace/publish |
| cursor.directory | Community browse | Faster / self-serve | **Separate queue** — listing there does **not** appear in official marketplace |

**Official plugin packaging**

1. Public Git repo (**open source required** for marketplace inspection).
2. Manifest: Agent Plugins root `plugin.json` **or** Cursor `.cursor-plugin/plugin.json` (kebab-case unique `name`).
3. Bundle MCP via root `mcp.json` / `mcpServers` (remote URL preferred; declare `${VAR}` secrets in manifest `variables` schema — never commit secrets).
4. Optional skills/rules/commands/hooks for “KitsuneOS in the IDE” UX.
5. Local test from `~/.cursor/plugins/local/<name>`, then reload window.
6. Apply as publisher / submit repo URL at https://cursor.com/marketplace/publish (accept Publisher Terms; contact `marketplace@cursor.com` if stuck).
7. Multi-plugin repos need `.cursor-plugin/marketplace.json` at repo root.

**Remote MCP without marketplace:** users can still add `url` + headers/OAuth in `~/.cursor/mcp.json` once Phase 2/3 works — marketplace is distribution, not a protocol requirement.

**Docs:** https://cursor.com/docs/plugins · https://cursor.com/docs/reference/plugins · community: https://cursor.directory

**KitsuneOS work items**

- [ ] Add `.cursor-plugin/plugin.json` (+ `mcp.json` pointing at remote MCP)
- [ ] Optional Agent Plugins–compatible `plugin.json` for portability
- [ ] README install deeplink / install instructions
- [ ] Submit official marketplace + mirror on cursor.directory
- [ ] Keep plugin open source and update-review ready

### 12.5 Grok / xAI (Connectors + Build Plugin Marketplace)

**Two different products**

| Product | How KitsuneOS shows up | Auth |
|---|---|---|
| **Grok web connectors** (`grok.com/connectors`) | User adds **Custom** MCP URL today; featured catalog is partner/sales | OAuth preferred (Client ID + PKCE; often empty client secret) |
| **Grok Build Plugin Marketplace** | PR into `xai-org/plugin-marketplace` | Plugin may include `.mcp.json`; remote plugins pin commit SHA |

**Custom connector (available now once remote MCP exists)**

1. Public MCP URL.
2. OAuth discovery that works with Grok’s custom-connector screens (authorize/token endpoints; PKCE; don’t put authorize URL in the “Server URL” field).
3. Docs for users: New Connector → Custom → paste `https://$APP_HOST/api/mcp` → complete OAuth.
4. Featured / built-in listing: contact xAI partnership (not self-serve).

**Grok Build marketplace (developer CLI / IDE-ish)**

1. Own public plugin repo with `plugin.json`, skills/commands as needed, `.mcp.json` for MCP.
2. PR to https://github.com/xai-org/plugin-marketplace (index-only repo — does not vendor your product):
   - Add one entry to `.grok-plugin/marketplace.json` (`name` kebab-case + remote `source.url` + **full 40-char lowercase commit `sha`**)
   - Regenerate index: `python3 scripts/generate-plugin-index.py`
   - Validate: `python3 scripts/validate-catalog.py` (and `generate-plugin-index.py --check`)
   - Pass CI + code-owner review (source legitimacy, least-privilege MCP/hooks, no duplicates, homepage/description/keywords)
3. Least-privilege MCP tool surface in the plugin.

**Docs:** https://docs.x.ai/grok/connectors · https://github.com/xai-org/plugin-marketplace/blob/main/CONTRIBUTING.md · https://x.ai/news/grok-plugin-marketplace

**KitsuneOS work items**

- [ ] Verify Grok custom-connector OAuth against staging URL
- [ ] Write grok.com connect guide in Connect UI / docs
- [ ] Package optional Grok Build plugin repo + marketplace PR
- [ ] Track featured-connector partnership separately from self-serve Custom

### 12.6 Suggested marketplace sequence (after Phase 3)

| Order | Action | Depends on |
|---|---|---|
| 1 | Official MCP Registry publish (`remotes` + npm stdio package) | Phase 1–2 |
| 2 | Claude custom-connector QA + Directory submission | Phase 3 + Team org |
| 3 | Cursor plugin repo + marketplace/directory submit | Phase 2–3 |
| 4 | OpenAI Apps/Plugins submission (demo account, annotations, domain challenge) | Phase 3 + OpenAI org verification |
| 5 | Grok custom-connector docs + Build marketplace PR | Phase 3 |
| 6 | xAI / OpenAI / Anthropic “featured” partnership outreach | Usage proof from 2–5 |

### 12.7 Gap matrix (today → marketplace-ready)

| Capability | Today | Needed for marketplaces |
|---|---|---|
| Stdio MCP | Yes | Cursor plugin / registry `packages` / Claude MCPB optional |
| Streamable HTTP MCP | No (REST only) | All remote stores / connectors |
| OAuth 2.1 + discovery | No | Claude Directory, ChatGPT auth apps, Grok custom, Cursor remote best path |
| Tool annotation hints | Partial / check | OpenAI three-hint set; Claude title + readOnly/destructive |
| Privacy / terms / support URLs | Partially present | All listings |
| Demo reviewer tenant | Ad hoc | OpenAI + Claude review |
| Domain challenges | No | OpenAI apps challenge; registry namespace |
| Plugin manifests (Cursor / Grok Build) | No | Marketplace packaging |
| Anthropic Team org + Directory permission | Unknown / ops | Claude Directory submit |
| OpenAI verified publisher | Unknown / ops | ChatGPT directory submit |  
