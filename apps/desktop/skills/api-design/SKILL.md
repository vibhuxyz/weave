---
name: api-design
description: "Apply when adding or changing an HTTP API: paths, status codes, error shape, pagination, caching, idempotency or JSON field naming."
---

# API design

- Versioned, plural, kebab-case paths: `GET /v1/orders`, `POST /v1/orders/:id/cancel`.
- JSON fields in camelCase. Time in ISO 8601 UTC. Money as a string or minor units, plus `currency`.
- One error shape everywhere: `{ "error": { "code": "PAYMENT_DECLINED", "message": "...", "details": {}, "requestId": "..." } }`.
- Status codes: 200, 201, 202 async, 204, 400, 401, 403, 404, 409 duplicate, 422 business rule, 429, 500, 503.
- Cursor pagination: `?limit=50&cursor=...` returns `{ items, nextCursor }`. Enforce a max limit.
- Return only the fields the client needs. Never a full database row.
- Cacheable GET responses send `Cache-Control` and `ETag`. Compress responses.
- Events are past tense (`order.placed`), commands are imperative (`SendInvoice`). Every message has `id`, `type`, `version`, `occurredAt`, `correlationId` and `data`. Consumers are idempotent.

**Why:** A client should be able to guess the next endpoint, the next error and the next page. Consistency removes a class of client bugs.
