---
name: CareerAI custom DB wrapper requires manual table registration
description: Adding a new Drizzle schema table in this project does not automatically make it queryable — the hand-rolled db wrapper needs it registered too.
---

`src/db/index.ts` is a hand-written Drizzle-like wrapper (not real Drizzle) that maps table objects to raw SQL table/column names via manual lookup tables: `tableMap` (table object → table name string) and `fieldToCol`/`colToField` (camelCase JS field → snake_case column, both directions).

**Why:** Drizzle's real query builder isn't used — `db.select().from(table)` resolves the table name via `tableMap.get(table)`, defaulting to the literal string `"unknown"` if not found, which fails with a cryptic `relation "unknown" does not exist` Postgres error that looks like a missing-table bug rather than a missing-registration bug.

**How to apply:** Whenever adding a new table to `src/db/schema.ts`, you must also, in `src/db/index.ts`:
1. Import the new table export.
2. Add it to `tableMap` with its snake_case table name.
3. Add each of its camelCase fields to both `fieldToCol` and `colToField`.
Skipping any of these silently breaks that table's queries even though the schema/table itself is fine.

**Also: the table must physically exist in Postgres — and `drizzle-kit push` does NOT work here.** The runtime connects via `DATABASE_URL` (a real node-postgres pool), but `src/db/drizzle.config.ts` reads a *different* set of vars (`SQL_HOST`/`SQL_DB_NAME`/`SQL_ADMIN_USER`/`SQL_ADMIN_PASSWORD`) which are unset, so `drizzle-kit push` throws `SQL_HOST must be set`. Create the new table with a direct idempotent `CREATE TABLE IF NOT EXISTS` (snake_case columns matching schema.ts) run against `DATABASE_URL` — the `executeSql` sandbox callback targets that same DB. Prefer this over a full `drizzle-kit push` anyway, since push diffs the whole schema and can try to alter/drop unrelated existing tables. A missing physical table surfaces as `relation "<name>" does not exist` (distinct from the `"unknown"` registration bug above).
