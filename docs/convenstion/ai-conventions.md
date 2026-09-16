# AI conventions

Two parts:
**Part A** — rules for AI agents writing code (Weave, Claude Code, any agent).
**Part B** — rules for apps that call an LLM at runtime.

---

# Part A — Agents writing code

## 1. Before writing

* **AI-01 MUST** — read: this file → the convention file for the area → `PROJECT.md` →
  the current roadmap step → related `DECISIONS.md` entries.
* **AI-02 MUST** — if the task needs something that does not exist (endpoint, table, event,
  env var), stop and report `BLOCKED: needs <thing>`. Build against a mock only if the task says so,
  and put mocks under `__mocks__/`.
* **AI-03 MUST** — stay on the current roadmap step. No "while I'm here" features, refactors,
  or optimisations.

## 2. Scope

* **AI-04 MUST** — one task = one logical change = one commit. Touch only the paths the task
  names, plus their tests.
* **AI-05 MUST** — shared contracts (`packages/contracts`, API specs, event schemas) are
  read-only for workers. Need a change? Output this and stop:
  ```
  CONTRACT_CHANGE_REQUEST
  file:    packages/contracts/events.ts
  change:  add `version` to Envelope
  why:     consumers must handle schema changes
  affects: apps/api, apps/worker
  ```
* **AI-06 MUST** — `NO_CHANGE_NEEDED` is a valid, successful result. Say why and stop.

## 3. Needs a human yes

Agents may propose, never merge without approval:

* money, pricing, billing, payments logic
* auth, sessions, permissions, CORS, CSP, cookies
* migrations that alter or drop existing columns
* CI, Dockerfiles, deploy, infrastructure
* adding or upgrading dependencies
* deleting, skipping, or weakening tests
* anything that sends email/SMS/push to real users

## 4. Honesty

* **AI-07 MUST** — never invent numbers ("40% faster") without a measurement committed to the repo.
* **AI-08 MUST** — never invent library APIs. Check the installed version's types or docs and
  name the version.
* **AI-09 MUST** — never pass a check by weakening it: no deleting tests, `.skip`, `any`,
  `@ts-expect-error`, `eslint-disable` without a reason + ticket in a comment.
* **AI-10 MUST** — if something was not run, say `not run`. Never claim "tests pass" from reading code.

## 5. Verification ladder

Run every step that exists, in order. Stop at the first failure.

```
1 typecheck
2 lint
3 test
4 build
5 boot         service/app starts
6 health       /healthz, /readyz, or app loads
7 smoke        the one flow the task changed
8 diff review  scope, secrets, debug logs, rule IDs
```

* **AI-11 MUST** — a step the project doesn't have is reported `not available`, not faked.
* **AI-12 MUST** — changes to money, auth, or data-integrity logic include a test even if the
  package had none.

## 6. Report format

```
STATUS:  DONE | NO_CHANGE_NEEDED | BLOCKED | FAILED
TASK:    <one line>
FILES:   <paths>
VERIFY:  typecheck ✅ lint ✅ test ✅ build ✅ boot n/a health n/a smoke ✅ diff ✅
RULES:   BE-13, FE-17
OPEN:    <questions or "none">
COMMIT:  <message>
```

## 7. Commits

* **AI-13 MUST** — one focused commit after verification passes; stage only relevant files.
* **AI-14 MUST** — imperative, under 72 characters, no `wip`/`fixes`/emoji, no `Co-authored-by`.
  ```
  ✅ Add idempotency key to checkout endpoint
  ❌ fixes
  ❌ WIP: stuff 🚀
  ```
* **AI-15 MUST** — never commit broken code or mix formatting into a logic commit.

## 8. Parallel agents (Weave)

* **AI-16 MUST** — one worktree per worker, with a declared file ownership list. No two workers
  own the same file.
* **AI-17 MUST** — only the orchestrator applies a `CONTRACT_CHANGE_REQUEST` and sends the delta
  to affected workers.
* **AI-18 SHOULD** — split dependent work into linked tasks (`T3a` backend, `T3b` frontend with
  `requiredOutputs` from `T3a`) instead of pausing mid-task.
* **AI-19 MUST** — parallel output must be as correct as a single agent. Faster but less correct
  is a failure.

---

# Part B — Apps that call an LLM

## 9. Structure

* **AI-20 MUST** — all LLM calls go through one module (`packages/ai` or `shared/lib/ai`).
  No SDK calls scattered in routes or components.
* **AI-21 MUST** — prompts live in files (`prompts/summarize-order.v2.md`), versioned, not inline
  strings. The version is logged with every call.
* **AI-22 MUST** — model names come from config, not hard-coded, with a fallback model defined.
* **AI-23 MUST** — LLM calls run on the server only. API keys never reach the client.

## 10. Input and output

* **AI-24 MUST** — structured output is parsed with Zod. On parse failure: one repair retry,
  then a typed error. Never pass unparsed model output into business logic.
* **AI-25 MUST** — user text and retrieved documents are data, not instructions. Wrap them in
  clear delimiters and never let them change tools, permissions, or system rules
  (prompt-injection defence).
* **AI-26 MUST** — the model never directly performs irreversible actions (payments, deletes,
  sending messages). It proposes; code validates; user or policy approves.
* **AI-27 MUST** — tools exposed to a model have the least permission needed and validate their
  own arguments.

## 11. Cost, latency, reliability

* **AI-28 MUST** — every call has a timeout, a max token limit, and retry with backoff on
  rate-limit/overload errors only.
* **AI-29 MUST** — log per call: model, prompt version, input/output tokens, latency, cost,
  `requestId`. Never log secrets; redact personal data.
* **AI-30 SHOULD** — stream responses for anything a user waits on.
* **AI-31 SHOULD** — per-user and per-org usage limits.
* **AI-32 SHOULD** — cache results for identical deterministic requests.

## 12. Quality

* **AI-33 MUST** — every prompt has an eval set (at least 10 real-looking cases with expected
  results) that runs before a prompt or model change is merged.
* **AI-34 MUST** — the UI marks AI-generated content and lets the user edit or reject it.
* **AI-35 SHOULD** — track user feedback (accept/edit/reject) per prompt version.