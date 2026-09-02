# KitsuneOS

**Developer preview — v0.1.0-preview. Self-hosted only. No auth layer, no security audit. Do not put production data in it.**

KitsuneOS is an application database for software that agents write to. Agent writes arrive as
reviewable change sets instead of landing directly, every record carries an attributed revision
history, and permissions are field- and row-scoped rows in a table rather than branches in your
application code. It runs on PostgreSQL and speaks [MCP](https://modelcontextprotocol.io), so an
agent connects to it the same way it connects to any other tool.

The thing worth ten minutes of your time: give an agent permission to change two fields, then watch
it get told no when it reaches for a third.

---

## Quickstart

You need **PostgreSQL running locally** and **Node 20+** with `pnpm`. Developed and tested against
PostgreSQL 16; 14 and 15 are expected to work but are untested.

```bash
git clone https://github.com/withciel/kitsuneos.git
cd kitsuneos
pnpm install
pnpm quickstart
```

`pnpm quickstart` checks for Postgres (and tells you how to install it if it is missing), creates the
`kitsune_owner` and `kitsune_app` roles and the `kitsune` database, runs migrations, and seeds a demo
CRM workspace with three accounts, two contacts and three opportunities. It is idempotent — running
it twice changes nothing and reports `nothing to do`.

It finishes by printing a config block to paste into your MCP client:

```json
{
  "mcpServers": {
    "kitsuneos": {
      "command": "node",
      "args": ["/absolute/path/to/kitsuneos/packages/mcp/dist/stdio.js"],
      "env": {
        "KITSUNE_WORKSPACE_ID": "11111111-1111-4111-8111-111111111111",
        "KITSUNE_PRINCIPAL_ID": "33333333-3333-4333-8333-333333333333",
        "KITSUNE_APP_URL": "postgresql://kitsune_app:kitsune_app@localhost:5432/kitsune",
        "KITSUNE_OWNER_URL": "postgresql://kitsune_owner:kitsune_owner@localhost:5432/kitsune"
      }
    }
  }
}
```

Cursor reads `.cursor/mcp.json`; Claude Desktop reads `claude_desktop_config.json`.

The demo has two principals. `owner` is a human with admin on everything. `assistant` is an agent
with `propose` on `opportunities`, limited to the fields `name`, `stage` and `next_step`. The config
above connects your agent **as the assistant**.

---

## The worked example

### 1. Ask the agent what it can see

The agent calls `describe_schema` and gets back only what its grant allows:

```json
{
  "collections": [
    {
      "name": "opportunities",
      "capability": "propose",
      "fields": [
        { "name": "name",      "type": "text",  "readable": true, "writable": true },
        { "name": "next_step", "type": "prose", "readable": true, "writable": true },
        { "name": "stage",     "type": "enum",  "readable": true, "writable": true }
      ]
    }
  ]
}
```

`accounts` and `contacts` are absent because the assistant has no grant on them. `amount` is absent
because it is outside the field mask. The agent is not told these exist and are forbidden; from
where it sits, they are not there at all.

### 2. Ask it to update a next step from a meeting note

> "Dana from Northwind asked for a revised quote by Friday. Update the Northwind renewal."

The agent queries, finds the record, and calls `propose_change_set`. It does not write:

```
change set a6f3c130-2e3f-408c-bfc4-d91c387586cc
  Northwind renewal follow-up
  by assistant, 6s ago, status open
  rationale: Meeting note: Dana asked for a revised quote by Friday.

  opportunities:0bbb0000-0000-4000-8000-000000000001
    [proposed] next_step
        - Send updated pricing sheet
        + Send revised quote by Friday, per Dana
```

Nothing has changed in the database yet. The proposal is sitting in a review queue.

### 3. Now ask it to change the amount

> "Also bump the amount to 99,000."

```json
{
  "error": "forbidden",
  "message": "Field not permitted: amount",
  "field": "amount"
}
```

**This is the part that matters.** The agent is not refused by a prompt, a policy string, or a
wrapper that decided to be careful. `amount` is not in its grant, so the query compiler will not
build SQL that touches it. There is no phrasing that gets around this, because the refusal does not
happen anywhere the agent's words can reach. The whole change set is rejected, not partially applied.

Note the asymmetry with step 1. A forbidden **field** is an explicit error that names the field, so
the agent can correct itself. A forbidden **row** is a plain not-found, so the agent cannot use
denials to map what it is not allowed to see.

### 4. Review the proposal

```bash
pnpm review
```

Shows every open change set with a field-level diff of current value against proposed value. Approve
it:

```bash
pnpm review <change-set-id> approve
```

You can also approve or reject individual operations by id, and attach a comment the author can read
back with `read_change_set_feedback`:

```bash
pnpm review <change-set-id> reject <op-id> --comment "Wrong quarter"
```

### 5. Check the history

```bash
pnpm history opportunities 0bbb0000-0000-4000-8000-000000000001
```

```
  revision 1  2026-09-02T01:41:29.255Z
    by       owner (human)
    changed  account_id, name, amount, stage, next_step

  revision 2  2026-09-02T01:42:36.758Z
    by       assistant (agent)
    changed  next_step
    via change set a6f3c130-2e3f-408c-bfc4-d91c387586cc
    next_step = "Send revised quote by Friday, per Dana"
```

The revision is attributed to the **agent that authored it**, not the human who approved it, and it
records the change set it arrived through.

---

## What works

Every claim below is backed by a numbered test in `packages/acceptance/src/suite.test.ts`. Run them
against your own Postgres with `pnpm acceptance`.

| Claim | Test |
|---|---|
| The runtime connects as a non-superuser with no `BYPASSRLS`, and every generated table has row level security enabled *and* forced | 0 |
| Defining a collection emits real DDL: real tables, real partial indexes, a real deferrable foreign key | 1 |
| Foreign keys are deferred to `COMMIT`, so a change set can create a record and reference it in either order | 2, 3 |
| Every write produces exactly one revision row with the correct `changed_fields` | 4 |
| A record's state at any past revision can be reconstructed | 5 |
| Soft-deleted records disappear from queries but remain in history | 6 |
| Applying a change set bumps `_revision` on every touched record | 7 |
| Two change sets touching different fields of the same record both apply | 8 |
| Two change sets touching the same field: the first applies, the second is blocked and names the conflicting field | 9 |
| Apply is atomic — a failure on the last operation leaves nothing behind | 10 |
| Partial approval applies exactly the approved operations | 11 |
| Concurrent applies over overlapping records do not deadlock | 12 |
| A change set against a deleted record fails at apply and does not resurrect it | 13 |
| Expired change sets cannot be applied | 14 |
| A field mask cannot be read around through any code path | 15 |
| A row predicate returns not-found, not forbidden, for excluded rows | 16 |
| A change set touching a field outside the author's mask is rejected when it is created | 17 |
| Revoking the author's grant before apply blocks the apply | 18 |
| A reviewer with broader permissions cannot launder in permissions the author lacked | 19 |
| An agent cannot be granted `write` without an explicit admin action, which is audited | 20 |
| Ten query shapes across seven principal classes match an independently written authorization oracle, exercised through the MCP handlers | 21 |
| Reads, writes, denials and grant changes all produce audit rows attributable to a principal | 22 |
| A relation target the author cannot see is byte-identical to one that does not exist | 23 |
| `describe_schema` shows only the collections and fields the caller is granted; the rest are absent, not marked forbidden | 24 |
| The application role can insert audit rows but cannot update or delete them | supplementary |
| A masked principal still receives record ids, but never a masked field | supplementary |
| Row level security really bites: a mismatched workspace GUC returns zero rows | supplementary |
| No code path issues `SELECT *`; every projection is an explicit column list | supplementary |

Test 21 compares against an authorization model written by hand in
`packages/acceptance/src/oracle.ts` rather than against the compiler, so it is not checking the
implementation against itself.

Test 10 uses a test-only fault-injection hook in the apply path (`applyFaultInjection`). It is
disclosed here rather than hidden: there is no other way to prove atomicity on the final operation.

---

## What does not work yet

- **There is no authentication.** The MCP server believes `KITSUNE_PRINCIPAL_ID` without question.
  Anyone who can start the server can act as any principal, including the admin. Permissions are
  enforced *given* a principal; nothing establishes who the caller actually is. This is the single
  biggest reason not to expose it to anything.
- **No hosted service, no signup, no billing, no multi-tenancy guarantees.** Self-hosted only.
- **No security audit** has been performed by anyone.
- **No GraphQL, no REST, no generated TypeScript client.** MCP and the CLI are the only surfaces.
- **No semantic search and no attachments.**
- **Schema evolution is create-only.** `defineCollection` can create a collection, but there is no
  supported way to add, rename, retype or drop a field afterwards. Changing your schema today means
  recreating the collection.
- **The data model will change before v1, with no migration path.** Expect to drop the database.

## Known limitations

- **One workspace per database, in practice.** The engine writes each workspace into its own
  Postgres schema, but the CLI is hardcoded to the demo workspace and nothing has been tested with
  several live workspaces sharing a database. Treat cross-workspace isolation as unverified.
- **Table count is the scaling ceiling.** Every collection becomes two real tables (the record table
  and its `__rev` history table) in a real schema. A few hundred collections is fine; tens of
  thousands will run into per-database table limits and degrade `pg_class` lookups. This design
  trades collection count for the ability to use ordinary Postgres indexes, constraints and RLS.
- **Default credentials are hardcoded.** `kitsune_owner` and `kitsune_app` are both created with
  their own name as the password. Fine on a laptop, unacceptable anywhere else. Override with
  `KITSUNE_OWNER_URL` and `KITSUNE_APP_URL`.
- **The audit log is append-only for the application, not for the operator.** `UPDATE` and `DELETE`
  are revoked from `kitsune_app` (supplementary test), but `kitsune_owner` — which runs migrations —
  can still rewrite it. Immutability holds against a compromised application, not a compromised
  operator.
- **Grants union rather than intersect.** Two grants on the same collection resolve to the highest
  capability, the union of their field masks, and the OR of their row predicates. You cannot narrow
  a principal by adding a second, more restrictive grant; you have to revoke the broad one.
- **Record ids are always returned,** even to a principal whose field mask excludes everything else.
  An id on its own carries no field data, and row predicates still decide which rows exist at all,
  but ids are not maskable.
- **Apply cost is linear in touched records.** Locks are taken one row at a time in sorted order to
  guarantee acquisition order, which costs a round trip per record. Change sets are expected to be
  small; a thousand-record change set will be slow.
- **`pnpm review` and `pnpm history` only operate on the demo workspace.** They are a demonstration
  surface, not an operator tool.
- **Postgres must be local and trusted.** There is no TLS configuration, connection pooling story, or
  guidance for a managed Postgres.

Nothing above is fixed by a flag. These are real gaps in a preview.

---

## How it fits together

```
packages/core        the engine: DDL generation, grant resolution, query compiler,
                     revisions, change sets, audit log
packages/mcp         five MCP tools over core, plus a stdio server
packages/cli         quickstart, review and history commands
packages/acceptance  the acceptance suite and its authorization oracle
```

Every read and every write goes through one query compiler. It resolves the caller's grant, projects
an explicit column list from the field mask, and injects the row predicate as parameterised SQL.
Row level security in Postgres sits underneath as a backstop, so a bug in the compiler still cannot
return another workspace's rows — that is what test 0 and the RLS supplementary test exist to prove.

Two database roles matter. `kitsune_owner` runs migrations and DDL. `kitsune_app` is a non-superuser
without `BYPASSRLS`, and it is the only role the runtime uses. If the engine connected as a
superuser, row level security would be decorative, so the suite asserts it every run.

## Running the tests

```bash
pnpm acceptance
```

Requires the same local Postgres as the quickstart. The suite creates and leaves behind its own
workspace schemas; drop the `kitsune` database to clean up.

## Reporting a bug

Open an issue at [github.com/withciel/kitsuneos/issues](https://github.com/withciel/kitsuneos/issues).
Useful reports include your Postgres version (`psql --version`), the output of `pnpm acceptance`, and
what you expected instead. If it is an authorization bug — a principal reading or writing something
its grant should have prevented — say so in the title. Those get looked at first.

## License

[Apache 2.0](LICENSE).
