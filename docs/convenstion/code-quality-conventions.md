# Code quality

Applies to every package in every project.
Short version: **typed, tested where it matters, small commits, no silenced checks.**

---

## 1. TypeScript

* **CQ-01 MUST** — `strict: true` and `noUncheckedIndexedAccess: true`.
* **CQ-02 MUST** — no `any`. Use `unknown` and parse with Zod.
* **CQ-03 MUST** — no non-null `!` without a comment explaining why it can't be null.
* **CQ-04 SHOULD** — model states as discriminated unions, not many booleans:
  ```ts
  // ❌ isLoading, isError, isSuccess, data?, error?
  type State =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'success'; data: Order[] }
    | { status: 'error'; error: ApiError };
  ```
* **CQ-05 MUST** — `switch` on a union ends with an exhaustive `never` check.
* **CQ-06 SHOULD** — derive types from schemas (`z.infer`) instead of writing them twice.

## 2. Naming

| Kind | Style | Example |
| :--- | :--- | :--- |
| variables, functions | camelCase; functions start with a verb | `calculateTotal` |
| booleans | `is/has/can/should` | `isExpired` |
| types, components, classes | PascalCase | `CheckoutForm` |
| constants | SCREAMING_SNAKE | `MAX_RETRY_COUNT` |
| files | match the main export; kebab or camel per framework, one style per repo | `order.service.ts` |
| units | in the name when not obvious | `timeoutMs`, `sizeBytes`, `amountPaise` |

* **CQ-07 MUST** — no unclear abbreviations. `usr`, `qty`, `tmp`, `mgr` → full words.
  OK: `id`, `url`, `api`, `db`, `ws`.

## 3. Functions and modules

* **CQ-08 SHOULD** — small and pure; I/O at the edges, logic in the middle.
* **CQ-09 SHOULD** — no boolean parameters; use an options object.
  ```ts
  sendEmail(user, true)                 // ❌
  sendEmail(user, { transactional: true }) // ✅
  ```
* **CQ-10 SHOULD** — return early instead of nesting `if`s.
* **CQ-11 MUST** — expected failures return `Result`; `throw` only for bugs.
* **CQ-12 SHOULD** — no file named `utils.ts` or `helpers.ts` over ~100 lines. Name by purpose:
  `money.ts`, `dates.ts`.
* **CQ-13 MUST** — no dead code, commented-out code, or unused exports in merged code.

## 4. Comments and TODOs

* **CQ-14 SHOULD** — comments explain **why**, not **what**.
* **CQ-15 MUST** — TODOs point somewhere:
  ```ts
  // TODO(#42): paginate once the list endpoint supports cursors
  // TODO(v2): replace polling with realtime channel
  ```
  A bare `// TODO: fix` fails review.

## 5. Tests

**Must be tested**

* money, pricing, tax, discount, and rounding logic
* auth and permission checks
* every Zod schema (one valid, one invalid sample)
* state machines and reducers
* retry, reconnect, idempotency logic
* every bug fix (test fails before, passes after)

**Usually not worth testing**

* components that only arrange other components
* third-party library behaviour
* trivial getters

Rules:

* **CQ-16 MUST** — test names describe behaviour:
  `it('returns 409 when the idempotency key was already used')`.
* **CQ-17 MUST** — Arrange → Act → Assert; one behaviour per test.
* **CQ-18 MUST** — no snapshot tests for data or API responses. Assert the values.
* **CQ-19 MUST** — tests don't depend on each other, on real time, or on the network.
  Inject clocks; use a real DB in Docker for integration tests.
* **CQ-20 SHOULD** — test pyramid: many unit, some integration (Vitest + real DB),
  few E2E (Playwright) covering the main money/user flows.

## 6. Tooling and CI

* **CQ-21 MUST** — one formatter and one linter config shared from `packages/config`.
  Format on save; CI checks it.
* **CQ-22 MUST** — GitHub Actions on every PR, per affected package (Turborepo):
  `typecheck → lint → test → build`. Red CI = no merge.
* **CQ-23 MUST** — no `console.log` in committed code. Backend uses the logger.
* **CQ-24 SHOULD** — pre-commit hook runs format + lint on staged files only (fast).
* **CQ-25 SHOULD** — dependency vulnerability scan and secret scan in CI.

## 7. Dependencies

* **CQ-26 MUST** — a new dependency gets one line in `DECISIONS.md`: why, size, alternative.
* **CQ-27 MUST** — one library per job (one HTTP client, one date lib, one icon set).
* **CQ-28 MUST** — lockfile committed. CLIs and build tools in `devDependencies`.
* **CQ-29 SHOULD** — prefer the platform first (`fetch`, `Intl`, `crypto.randomUUID`).

## 8. Commits and PRs

* **CQ-30 MUST** — one logical change per commit; imperative message under 72 characters.
* **CQ-31 SHOULD** — PRs over ~400 changed lines (excluding generated files and lockfiles) get split.
* **CQ-32 MUST** — formatting-only and rename-only changes go in their own commit.
* **CQ-33 SHOULD** — PR description: what, why, how verified, screenshots for UI.

## 9. Docs every repo keeps

```
README.md          what it is, how to run it in < 5 commands
docs/ARCHITECTURE.md   boxes and arrows, what owns what
docs/DECISIONS.md      numbered decisions with cost + revisit trigger
docs/conventions/      this folder (+ PROJECT.md exceptions)
.env.example
```

* **CQ-34 MUST** — a change to a route, event, table, env var or rule updates the matching doc
  in the same commit.

## 10. Definition of done

- [ ] typecheck, lint, test, build green
- [ ] critical logic has tests
- [ ] no new `any`, `!`, `.skip`, `eslint-disable` without reason
- [ ] loading / empty / error states handled (UI)
- [ ] errors show a real reason
- [ ] no secrets, no debug logs
- [ ] docs updated if a contract changed
- [ ] one focused commit

## 11. Review checklist

1. Does a `number` or float hold money? → `BE-06`, `DB-02`
2. Could this request or message run twice and double something? → `BE-16`, `BE-20`
3. Is there a network call inside a DB transaction? → `DB-14`
4. Can a user reach another user's data by changing an ID? → `BE-34`
5. Does a component read a whole store or skip error/empty states? → `FE-09`, `FE-16`
6. Is a secret in client env, logs, or git? → `BE-32`, `FE-38`
7. Is a check silenced instead of fixed? → `AI-09`
8. Is model output used without parsing? → `AI-24`