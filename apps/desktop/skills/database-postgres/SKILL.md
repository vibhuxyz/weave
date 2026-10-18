---
name: database-postgres
description: "Apply when designing schemas, writing migrations or queries, handling money, transactions, indexes or Redis caching on Postgres."
---

# Database and Postgres

**Schema:**
- Plural snake_case tables and snake_case columns. Primary key `id` (UUIDv7). Foreign keys `<singular>_id`, each indexed.
- Index names `idx_<table>__<cols>`, unique names `uq_<table>__<cols>`.
- `timestamptz` in UTC. Every table has `created_at`, and mutable tables have `updated_at`.
- `NOT NULL` by default. Enums as `text` plus `CHECK`. Constraints and foreign keys live in the DB. `jsonb` only for data you never filter or join on.
- Money is `bigint` minor units or `numeric`, never float, with a `currency`. Balance changes are append-only ledger rows. Fix mistakes with reversing entries.

**Queries and transactions:**
- Select only needed columns. No N+1: use a join or one `IN` query. Batch inserts.
- Keyset pagination: `where (created_at, id) < ($1, $2) order by created_at desc, id desc`. Check hot queries with `EXPLAIN`.
- Raw SQL only with parameters.
- No network calls inside a transaction. Keep transactions short. Duplicates use a unique constraint, one hot row uses `SELECT ... FOR UPDATE`, multi-row invariants use `SERIALIZABLE` and retry on `40001`.

**Migrations:** Generate with the ORM tool and review. Never edit a merged migration. Expand, backfill, switch reads, then contract across deploys. Use `CREATE INDEX CONCURRENTLY` on tables with data.

**Redis:** Keys `app:resource:id`, every key has a TTL, and Redis is never the only copy of data you cannot rebuild.
