# Product Marketing Context

**Document version:** v1  
**Last updated:** 2026-09-06

## Product Overview

**One-liner:** KitsuneOS is the application database humans and agents share.  
**What it does:** Field-level grants, propose/review change sets, and a console where operators and agents work the same CRM-shaped workspace — without a second system of record.  
**Product category:** Application database / agent-ready backend (Postgres-based)  
**Product type:** SaaS (hosted console + APIs/MCP)  
**Business model:** Hosted early access; self-host path later

## Target Audience

**Target companies:** Small teams and startups connecting AI agents to real business records (accounts, opportunities, tickets).  
**Decision-makers:** Developer / agent operator (primary); platform engineer at 50–500 person companies (secondary).  
**Primary use case:** Give agents scoped write access and human review without building staging tables, grant systems, and audit from scratch.  
**Jobs to be done:**

- Grant an agent field- and row-scoped access without a custom auth layer
- Review agent-proposed changes like a PR before they land
- Keep humans editing the same workspace the agent uses

**Use cases:**

- Agent drafts opportunity updates from meeting notes → human reviews in Inbox
- Operator edits CRM rows in the console while agents propose changes elsewhere
- Platform team standardises agent write controls across internal apps

## Personas

| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| Agent operator / developer | Speed to first agent write, MCP/API fit | Rebuilding grants + staging per app | Propose-by-default writes with field grants |
| Human operator | Same UI as the team, not a schema browser | Living in Notion/CRM while agents hit another DB | One console: tables, pages, Inbox |
| Platform engineer | Audit, blast radius, revoke | Agents with opaque write paths | Principals, history, revocable grants |

## Problems & Pain Points

**Core problem:** Databases assume reviewed application code writes them. Agents don’t. Teams either give agents production write access or keep them read-only.  
**Why alternatives fall short:**

- Postgres/Supabase: RLS is row-scoped; field grants + propose/review are DIY
- Agent backends: hide data behind admin tools; humans stay in another system
- Notion/Airtable + agents: two sources of truth, weak audit

**What it costs them:** Weeks rebuilding staging/permissions per app; incident risk; lost agent value if kept read-only.  
**Emotional tension:** Fear of an agent silently corrupting production data; fatigue of duct-taping review UIs.

## Competitive Landscape

**Direct:** Supabase / plain Postgres + custom agent layer — falls short on propose/review and field grants as product.  
**Secondary:** Convex / Firebase-style backends — not built as a shared human+agent workspace with Inbox review.  
**Indirect:** Notion/Airtable as ops UI + separate agent DB — split brain; no shared grants/history.

## Differentiation

**Key differentiators:**

- Agents and humans are equal principals on one grant table
- Propose ceiling by default; reviewable change sets
- Hosted console is the human product (tables, pages, Inbox), not a schema browser

**How we do it differently:** Authorization and review live in the data plane, not reimplemented per app.  
**Why that’s better:** Faster, safer agent writes; one workspace for operators and agents.  
**Why customers choose us:** Ship agent workflows without building the control plane first.

## Objections

| Objection | Response |
|-----------|----------|
| “We’ll just use Postgres RLS.” | RLS doesn’t give field masks, propose/review, or a shared human Inbox. |
| “Too early / unproven.” | Early access is invitation-only; CRM starter workspace proves the primitives. |
| “Won’t replace our CRM.” | Seed CRM proves the platform; you can model your own collections. |

## Switching Dynamics

- **Push:** Fear of agent writes; duplicated human/agent tools  
- **Pull:** Field grants + reviewable proposals in one console  
- **Habit:** Familiar Postgres / Notion / Airtable workflows  
- **Anxiety:** Migration cost; trust in a young control plane  

## Customer Language

**Use:** shared workspace, propose, review, grants, change set, field-level access, humans and agents  
**Avoid:** “AI-powered,” “seamless,” “next-gen,” vague “knowing” as the only message  
**Glossary:** change set = reviewable proposed writes; propose = agent ceiling below direct write

## Brand Voice

**Tone:** Calm, direct, lightly warm — not hype.  
**Style:** Short sentences; concrete nouns (grants, Inbox, collections).  
**Personality:** Precise, trustworthy, a little fox-clever — clarity first.

## Proof Points

- PRD G6: shared occupancy (human write + agent change set)  
- Propose-by-default agent path with audited override  
- MCP tools: describe_schema, query, propose_change_set  

## Goals

**Primary business goal:** Early access signups from agent-building teams.  
**Key conversion action:** Email “Join early access” (`support@kitsuneos.com`).  
**Current metrics:** Pre-launch / early access.

## Activation (MPTV)

**Aha moment:** A human write exists in a shared database *and* an agent proposal appears in Inbox for approve/reject.  
**Minimum path to value (4 steps):**

1. Create a database (shared table)
2. Add a page (first human write)
3. Connect an AI helper (MCP key + config)
4. Open Inbox (know where reviews land; complete when a proposal arrives or Inbox is visited)

**In-product:** dismissible setup checklist, first-run empty state on `/`, guided empty states on collection + Inbox, Connect framed as step 3 of 4.  
**Signup expectation:** Early access email → invite → WorkOS signup → land in empty workspace with checklist (no multi-field registration in-app).

## Changelog

- **v1 (2026-09-06):** Auto-drafted from `docs/prd.md` + current marketing site for landing rewrite.
- **v1.1 (2026-09-06):** Added Activation / MPTV for onboarding + signup skill alignment.
