# Engineering rules

Write production-quality code that is small, modular, correct, and easy to change.
Follow every section that applies to the files you touch.

---

## 1. Files and folders

### File size
- Hard limit: **250 lines per file**. Target 80–150. Split before a file passes 200.
- Functions under 40 lines. React components under 150 lines.
- One job per file, named by purpose: `order.service.ts`, `use-cart.ts`, `format-price.ts`.
- No `utils.ts`, `helpers.ts`, `common.ts`, `misc.ts`. Use `money.ts`, `dates.ts`, `retry.ts`.
- Keep pure logic and I/O in separate files, so pure logic can be tested without disk or network.
- If a file must break a limit (generated code, migration), explain it in the final report.

### Folder organization
- The top level of any `src/` contains only folders and `index.ts`. Never add a loose file there.
- This applies to every package type: apps, backend modules, frontend features, and libraries
  like `packages/core`.
- Create a folder when **any** of these is true:
  - 2 or more files share a prefix (`intake-*`, `run-task-*`) → folder named after the prefix
  - a file has a `.types.ts`,  or helper file next to it → they move into one folder
  - a folder has more than 8 source files (tests and `index.ts` not counted) → split by feature
- Inside a folder, drop the repeated prefix: `intake/detect.ts`, not `intake/intake-detect.ts`.
  Types live in `<folder>/types.ts`. Constants live in `<folder>/constants.ts`.
- Group by what the code is about (`intake/`, `runner/`, `verify/`), not by kind of file
  (`types/`, `helpers/`, `services/`). One allowed exception: files that follow the same pattern,
  like persistence stores, can share a folder (`stores/`).
- Code used by several folders and belonging to none goes in `shared/`, split by purpose.
- Every folder has an `index.ts`. Code outside the folder imports only from that `index.ts`.
- Tests sit next to the file they test.
- File and folder names are kebab-case: `run-command.ts`, `diff-review.ts`.
  Exception: React component files are PascalCase (`CartSummary.tsx`).

### Where does a new file go?
1. Find the folder whose feature matches. Put the file there.
2. No folder matches → create one with an `index.ts`.
3. Never put a file in a `src/` root "for now".

### Standard layouts

Library package (`packages/core`, `packages/agent`):
# for example packages/core/src/
  index.ts
  intake/     index.ts intake.ts detect.ts rungs.ts types.ts
  runner/     index.ts runner.ts run-command.ts types.ts
  verify/     index.ts verify.ts diff-review.ts types.ts
  stores/     index.ts tasks-store.ts sessions-store.ts
  shared/     fs-errors.ts

Backend app:
apps/api/src/
  index.ts
  modules/<feature>/
    index.ts
    <feature>.routes.ts    parse input, auth, call service, map result to HTTP
    <feature>.service.ts   business rules, returns Result
    <feature>.repo.ts      queries only
    <feature>.schema.ts    Zod schemas
    <feature>.test.ts
  shared/

Frontend app:
src/
  app/                 routes, layout, providers
  features/<feature>/  components/ hooks/ api/ store/ types.ts index.ts
  shared/              components/ hooks/ lib/ types/
  stores/              global stores

### How to split a big file
1. types and Zod schemas → `types.ts` / `schema.ts`
2. pure logic (parse, calculate, format, render) → named file (`parse-rule.ts`)
3. data access (fs, fetch, DB) → `repo.ts` / `api.ts` / `discover-rules.ts`
4. side effects and orchestration → `service.ts` / custom hook
5. UI → parent component + small child components
6. constants → `constants.ts`

Example:
rules/
  index.ts
  parse-rule.ts          pure: text → { name, body }
  discover-rules.ts      fs: folders → { rules, skipped }
  format-rules-block.ts  pure: rules → string
  constants.ts

### Moving existing files
- New files always follow the folder rules, even in a flat area.
- Do not move existing files unless the task is a reorganization. If an area breaks the folder
  rules, report it under OPEN: `packages/core/src has 32 loose files, suggest reorg`.
- A reorganization is its own task and its own commit:
  - moves and import updates only, no logic changes
  - show the folder plan first and wait for approval
  - use `git mv` so history is kept
  - update every import and keep the package's public `index.ts` exports the same
  - typecheck, lint, test, build must pass before commit

---

## 2. Imports and module boundaries
- Imports point one way. No circular imports, including between folders in one package.
  - Packages: `packages/contracts ← packages/domain ← packages/db ← apps/*`
  - Frontend: `app → features → shared`
  - Inside a package: feature folders may import `shared/`; `shared/` imports no feature folder.
- One app never imports from another app. Shared code goes in `packages/`.
- Import another folder only through its `index.ts`:
  - ❌ `import { detect } from "../intake/detect"`
  - ✅ `import { detect } from "../intake"`
- `index.ts` exports only what other folders use. Internal files stay private.
- Use path aliases (`@/`). No `../../../`.
- Import order: node built-ins → external packages → internal aliases → relative → styles.
- One style for import extensions across the repo. Do not mix `./checkpoint.ts` and `./checkpoint`.
- Use `import type` for type-only imports.
- Named exports. Default export only where the framework needs it (Next.js pages, `lazy()`).
- Barrel files only as a folder's `index.ts`. No `export *` from deep paths.
- No side effects on import.

---

## 3. TypeScript
- `strict: true`, `noUncheckedIndexedAccess: true`. Code must compile under both.
- Index access returns `T | undefined`. Handle it:
  - ❌ `match[1].trim()`
  - ✅ `match?.[1]?.trim()` or an early return
- No `any`. Use `unknown` and parse with Zod.
- No non-null `!`.
- Infer types from schemas with `z.infer`. Never write the same shape twice.
- Model states as discriminated unions, not many booleans.
- `switch` on a union ends with an exhaustive `never` check.
- Prefer `readonly` arrays and `as const` for data that must not change.
- Never `number` for money.

---

## 4. Functions and naming
- One function does one thing. If it needs "and" to describe it, split it.
- Pass only the data a function needs, not the whole object:
  - ❌ `renderClaimed({ ...state, decisions })`
  - ✅ `renderClaimed(decisions)`
- Max 3 positional parameters. More → one options object.
- No boolean parameters: `send(user, { transactional: true })`.
- Return early. Max 2 levels of nesting.
- Expected failures return a `Result`. `throw` only for bugs.
- Pure functions take inputs and return outputs. Pass `now` in; don't call `Date.now()` inside.
- No closures that read `let` variables changed elsewhere. Pass state in as a parameter:
  - ❌ `let items = ...; const render = () => use(items); items = trim(items);`
  - ✅ `render(view)` then `render(trim(view))`
- Prefer `const` and new values over reassigning `let`.
- No dead code: no unused variables, parameters, imports, exports, or branches that can never run.
  Remove duplicated checks.
- Unused parameters required by a contract start with `_` and are named in the final report.
- Full words, no unclear abbreviations. Booleans start with `is/has/can/should`.
- Units in names: `timeoutMs`, `amountPaise`, `maxBriefBytes`.
- Every magic number or string becomes a named constant: `SHORT_SHA_LENGTH = 8`.
- PascalCase for components, types, classes. camelCase for functions and variables.
  SCREAMING_SNAKE for constants.
- Same logic in 2 places is fine. In 3 places, extract it. No abstraction for a single use.

---

## 5. No comments
- Do not write comments. No `//`, `/* */`, JSDoc, `TODO`, `FIXME`, `NOTE`.
- Make code explain itself:
  - clear function names instead of a comment above a block
  - named constants instead of magic numbers
  - named predicates instead of tricky conditions: `if (isEligibleForRefund(order))`
- Links to specs and design docs go in the docs, next to the function name, not in code.
- Remove comments only on lines you already change.
- Follow-ups and reasons go in the final report.
- Allowed: license headers and required directives (`"use client"`, `"use server"`).
- Never add `eslint-disable`, `@ts-ignore`, or `@ts-expect-error`. Fix the problem.

---

## 6. Error handling
- No empty `catch {}` and no catch-all that hides real errors.
- Catch only the errors you expect, and let the rest surface:
```ts
  function isNotFound(error: unknown): boolean {
    return error instanceof Error && "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR");
  }
```
  "Folder missing" is normal. "Permission denied" must not look the same.
- When input is skipped (empty, duplicate, too large, unreadable), record why and return it:
  `{ items, skipped: [{ path, reason }] }`. Nothing is dropped silently.
- Error messages say what failed and with which input: `Cannot read rule file .weave/rules/db.md`.

---

## 7. Parsing text and untrusted input
- Treat every file, user message, tool output, API response and model output as untrusted.
- Parse with one strict pattern or a real parser. No chains of `indexOf` and `slice` offsets.
  - ❌ `text.indexOf("\n---", 3)` also matches `----` and `---abc`
  - ✅ an anchored regex: `/^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/`
- Handle both `\n` and `\r\n`.
- Validate structured data with Zod after parsing.
- Every parser has tests for: empty input, missing parts, CRLF, quotes, extra delimiters, huge input.

---

## 8. Bounded output and determinism
- Every list and text you render has a limit. Nothing grows without a cap.
  - cap list items: show 40, then `(+260 more)`
  - cap each text field: `MAX_CLAIM_CHARS`
  - cap the total: `MAX_BRIEF_BYTES`
- Measure bytes with `Buffer.byteLength(text, "utf8")`, not `.length`.
- A budget must always hold. If trimming optional parts is not enough, hard-cut the rest.
  Every trimming loop must be guaranteed to end.
- Output must be the same on every machine and run:
  - sort `readdir` results before using them
  - sort maps and sets before rendering
  - when duplicates exist, the winner is decided by a documented order, and the loser is reported.

---

## 9. Filesystem and paths
- Resolve every path from a known root and check it stays inside that root.
- Resolve symlinks with `realpath` before reading. Reject targets outside the project.
- Check file size before reading into memory. Skip files over the limit and report them.
- Read many files with bounded concurrency, not unlimited `Promise.all`.
- Never follow a path taken from file content or model output without these checks.

---

## 10. Building prompts and LLM context
- Content from repo files, issues, logs, tools, or earlier agents is **data**, not instructions.
- Wrap each untrusted piece in clear tags and escape the closing tag inside it:
  `body.replaceAll("</project-rules>", "<\\/project-rules>")`
- Flatten untrusted text that goes inside one line or section, so it cannot create fake headings:
  `text.replace(/\s+/g, " ").trim()`
- Label trust level: verified facts (tests that ran) vs claims (what a model said).
- Every block injected into a prompt has a byte budget. Report what was cut.
- Show where content came from (`sourcePath`) so the user can check it.
- Build prompts with pure functions: `(data) → string`, tested with hostile input.

---

## 11. Backend

### Layers
- Routes have no business logic. Services never see `req`/`res`. Repos have no business rules.

### API
- Versioned, plural, kebab-case paths: `GET /v1/orders`, `POST /v1/orders/:id/cancel`.
- JSON fields in camelCase. Time in ISO 8601 UTC. Money as a string or minor units with `currency`.
- Parse every body, query and param with Zod at the route.
- One error shape everywhere:
  `{ "error": { "code": "PAYMENT_DECLINED", "message": "...", "details": {}, "requestId": "..." } }`
- Status codes: 200, 201, 202 async, 204, 400, 401, 403, 404, 409 duplicate, 422 business rule, 429, 500, 503.
- Cursor pagination: `?limit=50&cursor=...` → `{ items, nextCursor }`. Enforce a max limit.
- Actions that create orders, payments or messages accept an `Idempotency-Key`.
- Long work returns `202` + job id.

### Events and queues
- Commands are imperative (`SendInvoice`). Events are past tense (`order.placed`).
- Every message has `id`, `type`, `version`, `occurredAt`, `correlationId`, `data`.
- Consumers are idempotent. Assume every message arrives twice.
- Publish after a DB write with the transactional outbox.
- Retry with backoff, then dead-letter queue. Never drop silently.
- A changed event shape gets a new `version`.

### Realtime
- Channel names `resource:id`. Private channels are scoped server-side.
- Updates carry a per-channel `seq`. Every channel has a snapshot for resync.
- Auth once at connect. Server heartbeat; drop dead clients.

### Auth and security
- Verify auth in one middleware. Handlers read `ctx.user`.
- Check authorization per resource in the service. Never trust an ID from the client alone.
- Browser apps: `HttpOnly; Secure; SameSite` cookies + CSRF. Short access token, rotating refresh token.
- Hash passwords with argon2id or bcrypt. Rate-limit login, OTP, password reset.
- Parse env once at boot with Zod; crash on bad config. Keep `.env.example` updated.
- No secrets in logs, errors, client env, or git. Rotate any leaked secret.

### Reliability and observability
- Timeout on every outbound call.
- Retry only retryable errors, with exponential backoff + jitter + max attempts.
- Structured JSON logs with `requestId`, `userId`, and the main entity id. No `console.log`.
- `/healthz` and `/readyz` on every service.
- Graceful shutdown: stop new work, finish in-flight work, close connections.

---

## 12. Frontend

### State
Server data → TanStack Query       Global UI → Zustand      Local UI → useState
Forms       → React Hook Form+Zod  Shareable → URL params   Imperative → useRef

- Never copy server data into Zustand or `useState`.
- Never put form state in a global store.
- Select the smallest store slice: `useCartStore(s => s.items.length)`.
- Query keys come from one key factory per feature.
- Invalidate related queries after a mutation.

### Data
- Parse every API response with Zod in `features/*/api/`.
- One `fetch`-based API client for base URL, auth, errors and `requestId`.
- No polling when a realtime channel exists.
- Components never touch `WebSocket` directly.

### UI
- Every data view handles loading, empty, error, and success.
- Show the server's error message. No "Something went wrong" when the reason is known.
- Optimistic UI only for safely reversible actions. Never show "Paid"/"Sent" before the server confirms.
- Disable submit while pending. Retries reuse the same idempotency key.
- Components receive data through props; logic lives in hooks.
- Colours and spacing from Tailwind `@theme` tokens. No hex values in components.
- One UI primitive set, one icon library.
- Format money, dates and numbers with `Intl` through `shared/lib/formatters.ts`.

### Performance
- Lazy-load routes and heavy libraries.
- Virtualize lists over ~200 rows.
- `memo`/`useMemo`/`useCallback` only when a profiler shows a problem.
- Set image width/height; lazy-load below-the-fold images.

### Accessibility and security
- Every input has a label. Icon-only buttons have `aria-label`.
- `<button>` for actions, `<a>` for navigation. Everything works by keyboard.
- Nothing secret in `VITE_*`, `NEXT_PUBLIC_*`, `EXPO_PUBLIC_*`.
- No `dangerouslySetInnerHTML` without sanitising.
- No auth tokens in `localStorage`.

---

## 13. Database

### Schema
- Tables plural snake_case. Columns snake_case. ORM fields camelCase mapped to snake_case.
- Primary key `id` (UUIDv7). Foreign key columns `<singular>_id`.
- Index names `idx_<table>__<cols>`, unique names `uq_<table>__<cols>`.
- Money as `bigint` minor units or `numeric`, never float. Store `currency`.
- `timestamptz` in UTC. Every table has `created_at`; mutable tables have `updated_at`.
- `NOT NULL` by default. Enums as `text` + `CHECK`.
- Foreign keys and constraints in the DB. Index every foreign key column.
- `jsonb` only for data you never filter or join on.

### Money and audit
- Balance changes are append-only ledger rows. Fix mistakes with reversing entries.
- Never update or delete financial rows.
- A cached balance changes in the same transaction as its ledger row.

### Transactions and concurrency
- No network calls inside a transaction. Keep transactions short.
- Choose the tool on purpose:
  duplicates → unique constraint · one hot row → `SELECT ... FOR UPDATE` ·
  rare edit clashes → `version` column · multi-row invariants → `SERIALIZABLE` + retry on `40001`.
- Idempotency keys have a unique index.

### Queries
- Select only needed columns in hot paths.
- No N+1 queries.
- Keyset pagination: `where (created_at, id) < ($1, $2) order by created_at desc, id desc`.
- Index every hot query's `where` + `order by`. Check with `EXPLAIN`.
- Raw SQL only with parameters. Never string concatenation.

### Migrations
- Generate with the ORM tool, then review before merge.
- Never edit a merged migration. Fix forward.
- Breaking changes: expand → backfill → switch reads → contract, across separate deploys.
- One purpose per migration, named for it: `0014_add_orders_status`.
- `CREATE INDEX CONCURRENTLY` on tables with data. Big backfills run as batched jobs.

### Redis
- Keys `app:resource:id`. Every key has a TTL.
- Redis is never the only copy of data you cannot rebuild.
- Locks have a TTL and an owner check on release.

---

## 14. AI features (apps that call an LLM)
- All model calls go through one module (`packages/ai` or `shared/lib/ai`).
- Prompts live in versioned files. Log the version.
- Model name comes from config, with a fallback model.
- Calls run server-side only. API keys never reach the client.
- Parse structured output with Zod: one repair retry, then a typed error.
- Follow section 10 for anything injected into a prompt.
- The model proposes; code validates; a user or policy approves irreversible actions.
- Tools given to the model have minimum permission and validate their own arguments.
- Every call has a timeout, a max token limit, and retries only on rate-limit/overload errors.
- Log model, prompt version, tokens, latency, cost, and `requestId`. Redact personal data.
- Stream responses users wait on. Add per-user usage limits.
- Every prompt has an eval set (10+ cases) run before prompt or model changes.
- The UI marks AI output and lets users edit or reject it.

---



## 16. Dependencies
- Use the platform first: `fetch`, `Intl`, `crypto.randomUUID`, `structuredClone`.
- One library per job.
- Do not add or upgrade a dependency without saying why in the final report.
- CLIs and build tools go in `devDependencies`. Commit the lockfile.

---

## 17. Working rules (for agents)
- Stay in scope. Change only what the task needs. No "while I'm here" refactors or file moves.
- If something the task needs does not exist, stop and report `BLOCKED: needs <thing>`.
- `NO_CHANGE_NEEDED` is a valid result.
- Never invent numbers, benchmarks, or library APIs. Check the installed version.
- Never pass a check by weakening it: no deleting tests, `.skip`, `any`, or disabled lint rules.
- Ask before touching: money logic, auth, dropping or altering columns, CI/deploy, dependencies,
  moving existing files.

---

## 18. Git
- One logical change per commit, after verification passes. Stage only relevant files.
- Imperative message under 72 characters. No `wip`, `fixes`, emoji, or `Co-authored-by`.
- Formatting-only and move-only changes go in their own commit. Use `git mv` for moves.

---

## 19. Self-review before you finish
Read your own diff and answer each question. Fix anything that is "yes".

**Folders**
1. Did I add a file to a `src/` root?
2. Did I add a file to a folder that now has more than 8 source files?
3. Do 2+ files share a prefix without sharing a folder?
4. Does a folder lack an `index.ts`, or does code outside a folder import something other than
   its `index.ts`?

**Structure**
5. Is any file over 250 lines or any function over 40?
6. Does one file mix pure logic with fs/network/DB?
7. Is there a `utils.ts`, a circular import, or mixed import extensions?

**Correctness**
8. Does anything fail under `strict` + `noUncheckedIndexedAccess` (unchecked `arr[i]`, `match[1]`)?
9. Is there an empty `catch`, or a catch that hides unexpected errors?
10. Is any input skipped or dropped without being reported?
11. Is text parsed with fragile `indexOf`/`slice` offsets instead of a strict pattern?
12. Does the output change with file order, map order, or machine?

**Limits and safety**
13. Can any list, string, prompt block, or file read grow without a cap?
14. Can a trimming or retry loop run forever?
15. Can untrusted text close a tag, add a heading, or escape its section?
16. Can a path or symlink reach outside the project root?

**Cleanliness**
17. Is there a closure over a changing `let`, or a function receiving a whole object for one field?
18. Is there dead code, a duplicated check, an unused variable or export, or an unreachable fallback?
19. Is there a magic number, an unclear name, or a comment?

---

## 20. Final report
1. List every file created, changed or moved with its line count.
2. Run what exists: typecheck → lint → test → build → boot → smoke. Mark anything else `not run`.
3. Show the folder tree for every folder you touched.
4. Report in this format:

STATUS:      DONE | NO_CHANGE_NEEDED | BLOCKED | FAILED
FILES:       <path — lines>
TREE:        <folder tree of touched folders>
VERIFY:      typecheck ✅ lint ✅ test ✅ build ✅ smoke not run
SELF-REVIEW: 19 questions checked, <any "yes" left and why>
OPEN:        <follow-ups, folder-rule violations found in untouched code, or "none">
COMMIT:      <message>
