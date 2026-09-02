# KitsuneOS v1 — Plan

**Date:** 2026-09-02
**Target:** hosted multi-tenant service, billed, deployed at **kitsuneos.com**, built by Ciel
**Theme:** dark, derived from the Ciel palette — tokens in [`design/kitsuneos-tokens-dark.css`](../design/kitsuneos-tokens-dark.css)
**Starting point:** `v0.1.0-preview`, 29 acceptance tests passing, self-hosted single-tenant
**Inputs:** KitsuneOS PRD, KitsuneOS System Design, Ciel brand voice guidelines, Ciel design system audit, Ciel brand discovery report, Notion — "Clear Graphics: YC landing-page structure pattern"

---

## 0. What changed since the plan was written

Three things were checked rather than assumed. Two of them change the plan.

### The real Ciel tokens exist and have been extracted

Blocking question 2 is answered. The `withciel` GitHub organisation exposes exactly one repository — this one — so the site repo is not reachable. The deployed stylesheet is, and the tokens are declared in it plainly. They are now recorded in [`design/ciel-tokens-extracted.css`](../design/ciel-tokens-extracted.css), sourced from `https://withciel.com/_astro/index@_@astro.ByKVJabr.css`.

| Token | Verified value |
|---|---|
| `--color-ciel-bg` | `#F4F0E8` |
| `--color-ciel-paper` | `#FBF8F1` |
| `--color-ciel-paper-soft` | `#EEE8DD` |
| `--color-ciel-text` | `#2E2B26` |
| `--color-ciel-accent` | `#B88A4A` |

**The plan's assumed ink `#1C1A17` is wrong. Production ink is `#2E2B26`** — noticeably lighter and warmer. Since the dark theme is defined as "the ink becomes the surface," every derived surface value moves with it. The token file is anchored on the real value.

Two smaller corrections fall out of the same extraction. Production Ciel *does* define `:focus-visible` — a solid 2px accent outline at 2px and 4px offsets — so the audit's unconfirmed gap is filled and should be inherited rather than reinvented. And "radius-none by default" is a convention rather than an absolute: `0`, `.25rem`, `.375rem` and `.5rem` all appear in production.

The palette is no longer a compound guess. It is one verified layer with one derived layer on top, and the derivation is measured.

### Contrast and colour-vision separation are measured, not estimated

Every ink was measured against every surface, and every state colour was simulated for deuteranopia and protanopia using the Machado et al. (2009) matrices. Full tables are in the token file. Headlines:

- `--k-ink-faint` peaks at 4.28:1 and bottoms at 2.84:1. It clears no text threshold on the darkest pairing, exactly as the plan predicted. It is marked decorative-only and must never carry status, field names or error copy.
- `--k-accent` at `#B88A4A` reaches only 3.87:1 on raised and 3.43:1 on overlay. It is a fill and border token. `--k-accent-text` `#D8A961` is the text-safe variant.
- **The `--k-pending` / `--k-attention` collision the plan worried about is not the real one.** Those two separate acceptably. The dangerous pair was **approved versus rejected** — a naive green and red collapsed to 7.3 dE under deuteranopia, which is the single most consequential confusion a review queue can have.

State colours were re-derived by constrained search: every value clears 4.5:1 against both `--k-surface` and `--k-surface-raised`, and worst-case pairwise separation went from 6.1 dE to **14.4 dE** across both deficiency types. Colour still never carries status alone — every status also needs a label or an icon.

### A workspace-id injection vector is already present in `core`

This one is load-bearing for Gate 0b and was verified by execution, not inspection.

`schemaNameForWorkspace` performs no validation:

```
schemaNameForWorkspace("not-a-uuid")      -> "ws_notauuid"
schemaNameForWorkspace("x'; SELECT 1--")  -> "ws_x'; SELECT 1"
```

`setSessionContext` in [`packages/core/src/db/pool.ts`](../packages/core/src/db/pool.ts) then interpolates that string straight into SQL. A crafted workspace id successfully overwrote a *different* GUC:

```
principal_id after crafted schema_name = "INJECTED"
```

`kitsune.principal_id` is the authorization context. Overwriting it is not a cosmetic bug.

**It is not exploitable today** — the stdio server takes the workspace id from `process.env`, which is trusted operator input, and there is no hosted surface. It becomes exploitable the moment a request-derived workspace id reaches that function, which is precisely what hosted multi-tenancy does. This is the first thing to fix in Gate 0b, before any tenant-facing code exists to fix it around.

The fix is small and has two halves: validate the workspace id as a UUID at the boundary and reject anything else, and replace the interpolated `SET LOCAL` calls with `SELECT set_config($1, $2, true)` so the values are bound parameters. `SET LOCAL` cannot take bind parameters; `set_config` can.

While in there: `setSessionContext` also issues `SET LOCAL search_path TO <schema>, kitsune, public`. Leak defense 2 says never `search_path`. The query compiler already fully qualifies every table reference, so the `search_path` line is redundant belt-and-braces that quietly undermines the guarantee. Remove it and let the qualification be the only mechanism, so the test that proves it means something.

---

## 1. Brand architecture — decide this first

Shipping KitsuneOS publicly is a brand decision before it is an engineering one.

The discovery report found four incompatible public product stories for Ciel and recommended keeping story D — "context/orchestration layer for agents" — as internal technical shorthand only. **KitsuneOS is story D.** Launching it as a paid public product makes D public and adds a fifth artifact to a naming situation the report just told you to simplify.

There is also a second, smaller repeat of a problem already solved once: the report settled **Ciel**, not *Ciel AI*. The Notion note says "Ciel AI and Kitsune." The repo says `kitsuneos`. Two live names for one product.

### Recommended architecture

**Ciel is the company and the application. KitsuneOS is the data layer Ciel is built on, sold to developers.**

It is true — the original diagram shows applications built on KitsuneOS with the CRM as one of them. Ciel is the flagship application. "We built this for ourselves and you can use it" is the most credible developer-infrastructure story there is, and it does not have to be manufactured.

It resolves D rather than leaking it. D stops being a competing description of Ciel and becomes an accurate description of a different, smaller, named thing.

**It gives Ciel the proof layer it does not have.** The biggest gap in the discovery report is that withciel.com makes a category claim with no evidence — no demo, no integration, no user, no benchmark. A deployed, paid developer product with a public acceptance suite is evidence that Ciel ships real infrastructure.

### What this requires

**Name: KitsuneOS.** Settled by the domain. Sweep Notion, the repo, and any remaining "Kitsune" references.

**Surface: kitsuneos.com,** standalone. On `kitsune.withciel.com` the relationship is structural — the URL says it. On its own domain, with its own name, voice register and palette, nothing carries the relationship implicitly. **The connection has to be stated or the proof-layer argument stops working**, leaving two unrelated products and story D reopened rather than resolved.

The link is load-bearing and runs both ways:

- **On kitsuneos.com:** "Built by Ciel" in the hero or footer, linked, and in the trust section. Not a passing credit — the sentence should say KitsuneOS runs in production as the data layer under Ciel, because that is the trust claim and it is true.
- **On withciel.com:** one line naming KitsuneOS as the data layer Ciel is built on, linked. Cheapest proof element available, and it does not disturb the manifesto voice.

Neither direction is optional. One without the other reads as a company distancing itself from its own product.

**Retire the GitHub bio today.** Unrelated to this build, still the most damaging artifact in the report, still a five-minute fix.

> Related and currently live: the GitHub repository description still reads *"CDN Proxy to make my images go fast ✨ (du du du max verstappen)"* from the project that previously occupied this repo. It is the first thing a visitor to the public repo sees. Same five-minute category of fix, and it undercuts the trust section directly.

---

## 2. Voice — which register KitsuneOS uses

The voice guidelines resolve this, and the answer is not the homepage voice.

The tone matrix gives Product UI microcopy: low formality, low energy, low technical depth, "Verbs. Never manifesto register in a button." And explicitly: *"if a user is about to authorise an action inside a real system, the copy states exactly which systems and exactly what will happen. No poetry at a permission gate."*

KitsuneOS is almost entirely that register. A database landing page in archival manifesto voice reads as evasion to the developer evaluating it, and the guidelines already warn that restraint without evidence is the brand's biggest risk.

**Carry over four attributes:**

- **Declarative.** Subject, verb, period. Headings three to six words. "Agents propose. You approve."
- **Instrumental.** The strongest fit in the whole document — "precise, patient, repeatable" is a description of a database. Keep the laboratory vocabulary. Avoid dashboards, experiences, magic.
- **Restrained.** No feature stacking, no adjective piles. Per the guidelines' own caution, restraint here means *understated evidence*, not *no evidence*. There is a test suite. Show it.
- **Transparent.** Labelling what things are, including uncomfortable things. This becomes the known-limitations section, and it is a brand asset.

**Drop two:**

- **Historical.** No 1946-to-2026 timeline on a database page. Continuity framing is Ciel's argument.
- **Humanist manifesto close.** Judgment, craft, care, ambition belongs on withciel.com. Here the close is a signup.

**Terminology.** The avoid-list applies in full and suits this product unusually well. `agentic` is on it, correctly — say "acts in real systems." So are seamless, leverage, unlock, supercharge, AI-powered, and "just." No exclamation marks, no emoji.

One deliberate exception: the must-use term **intent** carries a specific Ciel meaning. Use it where it is literally accurate — a change set carries an agent's intent to a reviewer — and do not stretch it.

**Write the failure register while you are here.** The guidelines flag it as the highest-value gap relative to effort, and KitsuneOS forces the issue: copy is needed for a blocked change set, a conflict, a past-due workspace, and an incident. Actor named, present tense, what it touched, then the remedy. Thirty minutes, and it seeds the register Ciel needs for Phase 2.

---

## 3. The convergence nobody planned

**The Action Consent component in the design system audit is the change-set review surface.** Not similar to it. It is it.

| Action Consent spec | KitsuneOS change set |
|---|---|
| `systems` — every system touched, named explicitly | Collections and fields the change set touches |
| `actions` — plain-language list, in order | The field-level operations, in `seq` order |
| `reversible` — drives visual and copy treatment | Whether the change set can be reverted from history |
| `intent` — the user's own words, echoed back | `change_sets.rationale`, the agent's stated reason |
| `scope` — once / session / standing | Grant capability: propose / write / standing grant |
| States: pending, approved, declined, expired | `open`, `applied`, `rejected`, `expired` |

Even the copy rules land: name every system in full, state irreversibility plainly, echo intent above the action list, imperative verbs on both buttons, never "Cancel" because it is ambiguous about what it cancels. That last one is exactly right for a review queue where "cancel" could mean the dialog or the change set.

The status vocabulary the audit says to define before Phase 2 — pending, acting, awaiting approval, completed, failed, reverted — is nearly the change-set status enum. `blocked` and `stale` are the two KitsuneOS adds, and both now have colours (`--k-blocked`, `--k-stale`) that are deliberately not the attention colour, because neither is a failure.

**Build the review UI as Ciel's Action Consent component.** One component, two products, and it forces the Phase 2 state vocabulary to exist under real load rather than in a spec.

**The token caveat is resolved.** Real tokens are extracted and recorded. The remaining risk is divergence, not ignorance: the two files must stay in sync from the moment the page ships.

---

## 4. Build plan

### Gate 0 — blocking, nothing proceeds

**0a. Test 0.** Already shipped and passing in `v0.1.0-preview`. `kitsune_app` and `kitsune_owner` both `rolsuper = f`, `rolbypassrls = f`; every generated table `relrowsecurity` and `relforcerowsecurity` true. Re-run and record verbatim.

**0b. Cross-tenant isolation.** Two workspaces, principals in each. A principal in A must not reach B through:

1. a forged workspace identifier in any MCP argument
2. one of B's record ids passed to `read_record`
3. a change set naming B's collections
4. a relation target into B's schema
5. a filter or aggregate referencing B's schema by qualified name
6. a pooled connection reused across A then B

All return not-found. Never data, never a distinguishable forbidden.

**0b must be preceded by the injection fix in Section 0.** Case 1 is currently not just a missing check but an active injection vector into the authorization GUCs. Write the fix and the test together.

Multi-tenant with a failing isolation test is not shippable at any price.

### The four leak defenses, each with a test not an inspection

| # | Defense | Status today |
|---|---|---|
| 1 | Workspace resolved from session server-side only. Never from a body, query string, header, or MCP argument. | Not implemented. No session layer exists; workspace id comes from `process.env`. Needs UUID validation at the boundary. |
| 2 | Schema names fully qualified. Never `search_path`. | **Half violated.** The compiler fully qualifies, but `setSessionContext` still sets `search_path`. Remove it. |
| 3 | `SET LOCAL` only, inside the transaction. Pool-size-one test running A then B back to back. | `SET LOCAL` is used correctly, but via string interpolation. Move to `set_config($1, $2, true)`. No pool-size-one test exists. |
| 4 | Two credentials. Provisioner does DDL; runtime cannot execute DDL at all. | Two roles exist (`kitsune_owner`, `kitsune_app`) and test 0 proves the runtime role's properties. Nothing proves `kitsune_app` cannot execute DDL. Needs an explicit test. |

### Order of work

1. Gate 0a and 0b, including the injection fix and the `search_path` removal
2. ~~MCP tool schemas~~ — **done in `v0.1.0-preview`.** All five tools now declare full JSON Schema and return denials as readable `isError` content.
3. The four leak defenses
4. Hosted auth (provider, magic link — do not build it) and signup provisioning, idempotent and resumable
5. **Schema definition API.** `defineCollection` exists in core and is exposed nowhere authenticated. A customer who cannot define collections has a demo, not a database. Authenticated HTTP endpoint plus MCP tool, running as the provisioner credential, relying on the DDL generator's identifier validation. That validation becomes security-critical the moment it takes customer input — review that diff personally, and note that the sibling function `schemaNameForWorkspace` has already been shown to have no validation at all.
6. Review UI as the Action Consent component, plus the history view with principal attribution
7. Billing (Section 5)
8. AWS deploy (Section 6)
9. ~~Foreign key existence oracle fix~~ — **done in `v0.1.0-preview`** as test 23. Relation targets resolve through the author's grant; a hidden target and a nonexistent one produce byte-identical errors.
10. Landing page (Section 7)
11. Legal pages
12. ~~Slack items~~ — **done in `v0.1.0-preview`.** `conflict_count` and `conflicted_fields` persist on `kitsune.change_sets`; apply sets `lock_timeout` and retries once.

Four of the twelve items are already closed by the preview, which buys room at the bottom of the list rather than at the top.

### Cut list

Drop from the bottom, never the top. If you reach item 7 and stop, that is a real product without billing, which is a fine place to end. If you reach item 6 and stop, it is a demo — say so rather than deploying it.

---

## 5. Billing — Dodo Payments

Merchant of record, so tax and VAT remittance are not yours tonight.

**Status enum is wider than the obvious five:** `pending`, `active`, `on_hold`, `paused`, `cancelled`, `failed`, `expired`. Map entitlement from this enum, not from a switch over event names — `paused` and `expired` falling through to "entitled" is how you give away free accounts.

**Webhooks are fully API-managed,** so no dashboard step mid-deploy. `webhooks.create({ url, filter_types, headers, idempotency_key, rate_limit })` and `webhooks.retrieveSecret(id)` both exist. This matters because the webhook URL does not exist until after the App Runner deploy — the deploy script registers the endpoint and writes the secret to Secrets Manager in the same run. Use `filter_types` to subscribe to subscription events only.

**Add a reconciliation sweep.** `subscriptions.list` filters by status. A periodic comparison of live status against stored entitlement catches anything a dropped webhook missed. A webhook failing at 3am and wrongly downgrading a customer is a more likely failure than anything exotic. Roughly twenty lines.

**Verify the signature before parsing. Persist every event by id and no-op on duplicates.**

**Past due degrades to read-only.** Reads keep working; writes and applies refuse with a link to the portal. Never delete or hide data over a billing state. Someone's card will expire tonight.

**Pricing.** Flat plan plus free tier; instrument the meter, do not bill on it. There is no usage data, and a metered price set wrong is much harder to walk back than a flat one. Dodo supports both, so switching later is a pricing change, not a migration.

On the unit: **do not meter applied change sets.** That is the behaviour the product exists to encourage, and taxing it makes reviewers approve less. Meter agent operations — MCP tool calls, reads and proposals — with a generous free threshold. Records stored is a reasonable second dimension.

---

## 6. Deploy

App Runner from an ECR image, VPC connector to RDS Postgres in private subnets. Automated backups and PITR on, with a restore actually tested once. Secrets Manager for everything; nothing in the repo or image. Route 53 and ACM. CloudWatch with alarms on 5xx rate and database connections. Infrastructure as code — you will redeploy several times and console-clicking twice at 2am is how staging and production diverge.

Migrations as a one-off task on deploy, not on service start, or App Runner instances race them.

If the VPC connector fights you for thirty minutes, fall back to ECS Fargate behind an ALB and stop fighting.

**Carry over from the preview:** default credentials are currently `kitsune_owner` / `kitsune_app` with their own names as passwords, and the README says so. Generated credentials in Secrets Manager are a deploy prerequisite, not a hardening pass.

---

## 7. Landing page

Structure follows the saved pattern: **hero → trust → problem → product → proof.** Resend, Chatbase, Artisan, Deel and Vanta converge on nearly identical structure; use the primitives rather than invent something exotic. Ciel's homepage is the exotic version and it works because it is a manifesto. This page is not that.

**1. Hero.** One declarative line and one clarifying line. Primary action: start free. Secondary: read the docs.

Draft: *"Agents propose. You approve."* / *"KitsuneOS is a Postgres-backed database where every agent write arrives as a reviewable change set, every record keeps attributed history, and permissions are data instead of application code."*

Three to six words in the heading. No adjective.

**2. Trust.** No logos and no users. Say what is true instead: built by Ciel, running in production as the data layer under Ciel, open acceptance suite, link to the test file. A visible test count is trust for this audience in a way a logo wall is not.

Do not fake this section. Silence where proof should be is itself a signal — but an invented signal is worse.

**3. Problem.** Three short paragraphs, no bullets. Agents are becoming writers. Postgres assumes writes come from code a human reviewed before deploying. So every team building an agent-facing application rebuilds the same staging table, status column and approval screen — badly, and it is security-critical every time.

**4. Product — exactly three features,** matching the three primitives:

- **Change sets.** Agents propose field-level operations. You approve, reject per operation, and apply atomically. Two agents editing different fields of the same record both apply cleanly.
- **Grants.** Permissions are rows, not code. Scope an agent to specific fields and specific rows. A change set touching anything outside its grant is rejected at creation, naming the field.
- **History.** Every write is a revision, attributed to the principal that made it. Reconstruct any record at any point.

Each gets a short code block or a screenshot of the review queue. This is where the site stops being a claim.

**5. Proof.** The thing Ciel's homepage does not have, and the reason to build this page carefully.

The strongest available artifact is a thirty-second recording of the worked example: agent proposes a `next_step` update, agent attempts to change `amount`, gets rejected naming the field, human approves the first in the review queue, history shows the revision attributed to the agent. That rejection is the whole product in one frame.

This already works end to end in the preview and has been run on a clean machine, so the recording is a capture job rather than a build job.

Also here: link the acceptance suite, name the test count, state the isolation guarantee and how it is verified.

**6. Known limitations — keep this section.** Transparency is a documented brand attribute and the audience rewards it. No GraphQL, no generated client, no semantic search, no attachments, the table-count scaling limit, create-only schema evolution. A developer who finds a limitation you disclosed trusts the rest of the page. One who finds one you hid does not.

The preview README already carries an honest version of this section. Port it rather than softening it for marketing.

**7. Close.** Signup. No manifesto. One line and a button.

### Visual — dark, derived from Ciel

**The dark theme is Ciel's palette with the two anchor tokens swapped, not a new palette.** Ciel's canvas is `#F4F0E8` and its ink is `#2E2B26`. Here the ink becomes the surface and the bone becomes the text. Same warm hue family, inverted lightness. No cold blue-black, no `#0A0A0A`, no pure white.

This is more on-metaphor than it first appears. The design audit says the visual language is "archival plates and **instrument panels**." Instrument panels have always been dark with warm illuminated readouts. A database page is closer to that half of the metaphor than the archival half.

Carried over unchanged: hairlines rather than shadow, square by default, generous vertical rhythm, calm motion durations, mono for every system identifier — collection names, field names, revision numbers, principal ids. Mono carries more weight here than on withciel.com.

Three deliberate departures:

- **Body text is not the pure bone.** Display headings get `#F4F0E8`; body sits one step down at `#E4DED2`. Full-strength warm white on near-black haloes for many readers over a long docs page.
- **Two new state tokens.** `--k-blocked` and `--k-stale` have no Ciel equivalent. A blocked change set is not a failure — two agents touched the same field — and a stale one just means the base revision moved. Rendering either in the attention colour would report a fault where none occurred. Push both back up into the Ciel system; Phase 2 will need the same distinction.
- **Hero type one step smaller than Ciel's.** This page argues; it does not declaim.

**Do not use the archival sepia photography.** It is Ciel's most distinctive visual asset and belongs to the manifesto register. A database page wants code blocks and a screenshot of the review queue. Borrowing the treatment here dilutes the one visual signal Ciel owns, and it would look like decoration on a page whose job is proof.

**The shared Action Consent component must be theme-aware from its first commit.** It spans a light product and a dark one, so no colour is ever hardcoded inside it — the token layer is the contract between Ciel and KitsuneOS. Retrofitting this when Ciel Phase 2 arrives would mean rewriting the component that gates every irreversible action in both products.

**Inherit the accessibility fixes, do not repeat the defects.** Real `aria-label` on social links; the `𝕏` character bug is documented in the audit and must not be copy-pasted. Descriptive alt text on every image. `:focus-visible` is defined explicitly in the token file, matching what production Ciel already does.

**Contrast is measured, not guessed** — see Section 0 and the tables at the foot of the token file. The remaining discipline is to re-measure on change rather than to trust the file.

---

## 8. Decisions needed

**Settled:**

- Name: **KitsuneOS**
- Surface: **kitsuneos.com**, standalone
- Theme: **dark**, derived from Ciel by swapping the anchor tokens

**Answered by investigation, no longer blocking:**

- **Do the real design tokens exist?** Yes, and they are extracted and recorded. The site repo is unreachable, but the deployed CSS is authoritative. One correction: the ink is `#2E2B26`, not `#1C1A17`.

**Still blocking:**

1. **Confirm the brand architecture** — Ciel the company and application, KitsuneOS the data layer beneath it, sold to developers. Sections 2 and 7 rest on this. If you disagree, the voice register and the whole trust section change.
2. **Who owns the reciprocal link on withciel.com?** The architecture only holds if it runs both ways. A one-directional link is worse than none.

**Not blocking, cheap, outstanding:**

3. Retire the GitHub bio. Five minutes, most damaging artifact you have.
4. Fix the GitHub repository description, which still advertises the CDN project that used to live here.
5. Fix the `𝕏` link on withciel.com. Ten minutes, three instances, real defect.

---

## 9. Report format

At the end of the build, report:

- Gate 0a and 0b, verbatim
- Which of the four leak defenses are covered by tests versus inspection
- Go/no-go checklist with evidence per item
- Where you stopped on the cut list
- Every landing-page claim not backed by a test
- Every shortcut a second person should review the following morning
