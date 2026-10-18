---
name: express-backend
description: "Apply when writing or changing server code: Express or Node routes, services, repos, middleware, auth, env config, logging and outbound calls."
---

# Express and Node backend

**Layers:**
- `*.routes.ts` parses input with Zod, checks auth, calls a service, maps the result to HTTP. No business logic.
- `*.service.ts` holds business rules and returns a `Result`. It never sees `req` or `res`.
- `*.repo.ts` runs queries only, with no business rules.
- `*.schema.ts` holds Zod schemas. Parse every body, query and param at the route.

**Auth and security:**
- Verify auth in one middleware. Handlers read `ctx.user`.
- Check authorization per resource in the service. Never trust an ID from the client alone.
- Hash passwords with argon2id or bcrypt. Rate-limit login, OTP and password reset.
- Parse env once at boot with Zod and crash on bad config. Keep `.env.example` current.
- No secrets in logs, errors, client env or git.

**Reliability:**
- Timeout on every outbound call. Retry only retryable errors, with exponential backoff, jitter and a max attempt count.
- Structured JSON logs with `requestId`, `userId` and the main entity id. No `console.log`.
- Serve `/healthz` and `/readyz`. Shut down gracefully: stop new work, finish in-flight work, close connections.
- Create-order, payment and message actions accept an `Idempotency-Key`. Long work returns `202` and a job id.

**Why:** Thin routes and pure services keep logic testable without HTTP, and a single auth path leaves one place to audit.
