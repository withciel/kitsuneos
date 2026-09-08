# KitsuneOS UI Program Charter

**Date:** 2026-09-08  
**Status:** Approved for Wave 0 (charter). Wave 1 umbrella specs ship alongside this doc.  
**Method:** Brainstorm Approach 3 then 2 — charter first, then three parallel umbrella specs.  
**Authority:** PRD + system design win on product/engine; live UI wins on visual truth.

---

## 1. Purpose

Produce a durable design program for KitsuneOS UI covering:

- Marketing site audit + redesign brief + activation handoff (**S1**)
- Console operator craft + animation findings (**S2**)
- Remaining product-gap UX (**S3**)

No product code lands in Wave 0–1. Wave 2 creates implementation plans via `writing-plans` (one plan per umbrella spec). Wave 3 is implementation PRs.

---

## 2. Program architecture

```
Wave 0  Charter (this doc)
Wave 1  S1 Site | S2 App craft + motion | S3 Product gaps   (parallel)
Wave 2  writing-plans × 3
Wave 3  Implementation PRs
```

| Spec | Path |
|------|------|
| Charter | `docs/superpowers/specs/2026-09-08-ui-program-charter-design.md` |
| S1 Site | `docs/superpowers/specs/2026-09-08-site-audit-activation-design.md` |
| S2 App | `docs/superpowers/specs/2026-09-08-app-craft-motion-design.md` |
| S3 Gaps | `docs/superpowers/specs/2026-09-08-product-gaps-design.md` |

Motion implementation plan stubs and Wave 2 plans live under `docs/superpowers/plans/` (repo convention). Do not invent a parallel root `plans/` tree unless a future tooling skill requires it; if so, symlink or point the skill at this directory.

---

## 3. Skill conflict resolution

Attached design skills disagree. Resolution is fixed here:

1. `docs/prd.md` / `docs/system-design.md` — scope and engine DNA  
2. Live `apps/site` and `apps/app` — visual truth over stale `design/*.css`  
3. Existing `docs/superpowers/specs/*` — IA unless an umbrella deliberately supersedes  
4. Motion — Emil / Apple rules (purpose, frequency, `transform`/`opacity`, interruptibility, reduced motion)  
5. Marketing — Persuade + anti-slop (no AI-purple, no three-equal cards, no em-dash tells, hero budget)  
6. Console — Operate (scanability, density, quiet chrome)  
7. Industrial brutalist / liquid-glass / editorial luxury — reference only, not direction  

**Mode lock**

| Surface | Mode |
|---------|------|
| `apps/site` | Persuade |
| `apps/app` | Operate |
| Signup → empty workspace | Persuade → Operate bridge |

---

## 4. Brand and token lock

- **Dark-only** both surfaces. No light theme in this program.  
- **Accent:** orange `#f54e00` (site `--k-orange`, app `--primary`).  
- **Site type:** Fraunces (display) + Outfit (body) — keep unless S1 audit forces a swap; do not introduce Inter.  
- **App type:** Outfit + IBM Plex Mono — keep.  
- **No new palette families** (no cream+brass, purple mesh, CRT green).  
- `design/ciel-tokens-extracted.css` and `design/kitsuneos-tokens-dark.css` are historical; S1/S2 may recommend sync or retire.  
- **Redesign posture:** preserve brand and IA labels; overhaul only where audit shows structural debt. Silent copy claim changes are forbidden.

---

## 5. Non-goals (program-wide)

- Engine rewrites unrelated to named S3 gaps  
- CRM packaging / auto-seeded LOB schemas  
- Light theme, native mobile, public page CDN, CRDT multiplayer  
- Local-first Obsidian vault sync / FUSE  
- Replacing MCP / GraphQL / REST as primary APIs  
- Installing Framer Motion unless an S2 plan proves CSS / `tw-animate-css` insufficient  
- Animating keyboard / ⌘K open-close or other 100+/day actions  

---

## 6. Error handling and evidence standards

- Specs cite concrete paths (`apps/...`). Findings without paths are invalid.  
- Audits distinguish **Keep / Fix / Reject**.  
- Engine blockers are labeled **dependency** (not UI-only).  
- Wave 1 does not require live deploy screenshots; Wave 3 implementation must verify with health checks / walkthrough artifacts per cloud agent norms.

---

## 7. Success criteria

| Wave | Done when |
|------|-----------|
| 0 | Charter committed; skill/brand locks unambiguous |
| 1 | S1–S3 committed; an implementer can plan each without product questions |
| 2 | Three implementation plans exist under `docs/superpowers/plans/` |
| 3 | PRs land against those plans; reduced-motion and activation honesty verified |

---

## 8. Review order

1. This charter  
2. S1 / S2 / S3 in any order (parallel)  
3. User approval gate before Wave 2 `writing-plans`  
4. Implementation only after plans are approved  

---

## 9. Supersession notes

- Does **not** replace pages/change-request ontology in `2026-09-05-pages-and-change-requests-design.md`.  
- **Does** reopen marketing redesign (explicitly deferred in `2026-09-03-notion-console-ui-design.md`).  
- S2 extends console craft beyond IA; operate helpers shipped 2026-09-08 (`OperateEmptyState`, `PageHeader`, `ShellHeader`, `operate-enter`) are the new baseline, not debt to undo.
