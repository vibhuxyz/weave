# Backend conventions

Scope: HTTP APIs, background workers, queue consumers, WebSocket servers, shared packages.

---

## 1. Monorepo layout

```
packages/
  contracts/   types, Zod schemas, event names, error codes   (no runtime deps)
  domain/      pure business logic, no I/O
  db/          schema, migrations, client
  config/      tsconfig, eslint, shared env parsing
apps/
  api/         HTTP
  worker/      queue consumers, cron jobs
  ws/          realtime fan-out
  web/         frontend
```

* **BE-01 MUST** — imports point one way: `contracts ← domain ← db ← apps/*`.
  One app never imports another app.
* **BE-02 MUST** — any type used by two apps lives in `packages/contracts`. No copy-paste types.
* **BE-03 SHOULD** — inside an app, group by **feature**, not by layer:
  ```
  apps/api/src/modules/orders/
    orders.routes.ts   orders.service.ts   orders.schema.ts   orders.test.ts
  ```
  Not `controllers/ services/ utils/` — those become dumping grounds.

## 2. Layers inside a module

```
route      parse input (Zod) · auth · call service · map result to HTTP
service    business rules · calls repo + other services · returns Result
repo       DB queries only · no business rules
```

* **BE-04 MUST** — routes contain no business logic. Services never see `req`/`res`.
* **BE-05 MUST** — repos contain no `if` about business rules, only queries.

## 3. Money, time, IDs

* **BE-06 MUST** — never `number` for money. Use integer minor units (`paise`, `cents`) as
  `bigint`, or `Decimal`. On the wire, send a string: `{ "amount": "499.00", "currency": "INR" }`.
  (UPI does not send ₹10.0999999.)
* **BE-07 MUST** — time is UTC everywhere. Wire format is ISO 8601 (`2026-09-16T10:30:00Z`).
  Convert to local time only in the UI.
* **BE-08 SHOULD** — IDs are UUIDv7 (sortable by time) or ULID. Never expose auto-increment IDs
  in public URLs.
* **BE-09 MUST** — business logic takes time as an input (`now: Date`) instead of calling
  `Date.now()` inside, so it can be tested.

## 4. HTTP API

* **BE-10 MUST** — versioned, plural nouns, kebab-case paths:
  `GET /v1/orders`, `POST /v1/orders`, `GET /v1/orders/:id`, `POST /v1/orders/:id/cancel`.
* **BE-11 MUST** — JSON fields are camelCase.
* **BE-12 MUST** — every body, query and param is parsed with Zod at the route.
* **BE-13 MUST** — one error shape across all apps:
  ```json
  {
    "error": {
      "code": "PAYMENT_DECLINED",
      "message": "Your card was declined",
      "details": { "retryable": false },
      "requestId": "01J8Z..."
    }
  }
  ```
  `code` is SCREAMING_SNAKE and listed in `packages/contracts/errors.ts`.
  `message` is safe to show a user. `details` carries data the UI needs.
* **BE-14 MUST** — status codes:
  `200` ok · `201` created · `202` accepted (async) · `204` no body ·
  `400` bad input · `401` not signed in · `403` not allowed · `404` · `409` conflict/duplicate ·
  `422` business rule rejected · `429` rate limited · `500` our bug · `503` dependency down.
* **BE-15 MUST** — list endpoints use cursor pagination: `?limit=50&cursor=...` →
  `{ items, nextCursor }`. Max `limit` is enforced server-side.
* **BE-16 MUST** — any `POST` that creates money movement, an order, or a message accepts an
  `Idempotency-Key` header. Same key → same response, no second action.
  (Double-tapping "Place order" on Swiggy must give one order.)
* **BE-17 SHOULD** — long work returns `202` + a job id; the result comes by webhook, WebSocket,
  or `GET /v1/jobs/:id`.

## 5. Events and queues (RabbitMQ or similar)

* **BE-18 MUST** — commands are imperative (`SendInvoice`), events are past tense
  (`invoice.sent`, `order.placed`) in `domain.past_tense` form.
* **BE-19 MUST** — every message has one envelope:
  ```ts
  type Envelope<T> = {
    id: string;          // unique, used for dedupe
    type: string;        // 'order.placed'
    version: number;     // schema version of data
    occurredAt: string;  // ISO UTC
    correlationId: string;
    data: T;
  };
  ```
* **BE-20 MUST** — every consumer is idempotent. It stores processed `id`s or writes with a
  natural key. Assume every message arrives at least twice.
* **BE-21 MUST** — publishing after a DB write uses the **transactional outbox**. Never
  "write DB, then publish" as two separate hopes.
* **BE-22 MUST** — failed messages retry with backoff, then go to a dead-letter queue.
  Nothing is dropped silently.
* **BE-23 MUST** — changing an event shape = new `version`. Consumers handle old and new until
  the old one is gone.

## 6. Realtime (WebSockets)

* **BE-24 MUST** — channel names are `resource:id` (`chat:room_42`, `orders:user`,
  `prices:BTC-USD`). Private channels are scoped to the authenticated user server-side.
* **BE-25 MUST** — every update message has a per-channel `seq`. Every channel has a snapshot.
  A client that sees a gap re-fetches the snapshot.
* **BE-26 MUST** — auth once at connect. Server sends ping; clients that miss two are dropped.
* **BE-27 SHOULD** — realtime is for pushing changes. The first load comes from REST or a snapshot.

## 7. Errors and results

* **BE-28 MUST** — expected failures are returned values, not exceptions:
  ```ts
  type Result<T, E extends { code: string }> = { ok: true; value: T } | { ok: false; error: E };
  ```
  `throw` is for bugs and broken infrastructure.
* **BE-29 MUST** — one global error handler maps unknown errors to `500` with `requestId`,
  and never leaks stack traces or SQL to the client.

## 8. Config and secrets

* **BE-30 MUST** — env is parsed once at boot with Zod. Bad or missing value → crash on start.
* **BE-31 MUST** — `.env.example` lists every variable with a fake value. Real `.env` is never
  committed.
* **BE-32 MUST** — secrets never appear in logs, errors, client bundles (`NEXT_PUBLIC_*`,
  `VITE_*`, `EXPO_PUBLIC_*`), or git history. A leaked secret is rotated, not just deleted.

## 9. Auth

* **BE-33 MUST** — auth is verified in one middleware. Handlers read `ctx.user`.
* **BE-34 MUST** — authorization (can this user touch this row?) is checked in the service,
  per resource. Never trust an ID from the client alone.
* **BE-35 SHOULD** — browser apps use `HttpOnly; Secure; SameSite` cookies + CSRF protection.
  Short-lived access token + rotating refresh token with reuse detection.
* **BE-36 MUST** — passwords hashed with argon2id or bcrypt. Rate-limit login, OTP, reset.

## 10. Logs, metrics, health

* **BE-37 MUST** — structured JSON logs with `requestId`, `userId`, and the main entity id.
* **BE-38 SHOULD** — levels: `error` someone must act · `warn` odd but handled ·
  `info` state change · `debug` off in production.
* **BE-39 MUST** — `/healthz` (process alive) and `/readyz` (dependencies ready) on every service.
* **BE-40 SHOULD** — RED metrics per route: rate, errors, duration (p50/p95/p99).

## 11. Resilience

* **BE-41 MUST** — every outbound call has a timeout. No call waits forever.
* **BE-42 MUST** — retries use exponential backoff with jitter and a max attempt count,
  and only on retryable errors.
* **BE-43 MUST** — on `SIGTERM`: stop taking new work, finish in-flight work, close
  connections, exit.
* **BE-44 SHOULD** — rate limits on public endpoints, keyed by user or IP, stored in Redis.
