# What has been built, phase by phase

The work was requested in phases. The docs are organised by version tier
([LADDER](LADDER.md)), so this page maps each phase to its tier, its commits and its detail.

| Phase | What | Tier | Commits | Detail |
|---|---|---|---|---|
| 1 | Not yet described here | — | — | — |
| 2 | Project intelligence | V2.2 | `d03713a` `9df8d75` `aa04f5f` | [V2 §V2.2](V2.md) |
| 3 | Context intelligence | V1.2 | `3a6c65c` `508c954` `63cfb73` `424a937` `3cc88d0` | [CONTINUATION](CONTINUATION.md) |
| 4 | Coordination and live collaboration | V2.1 | `5fcb93f` | [V2 §V2.1](V2.md) |
| 5 | Adaptive orchestration | V3.1 | `3eb5528` | [V3 §V3.1](V3.md) |
| 6 | AI employee runtime | — | `95580cf` | [EMPLOYEES](EMPLOYEES.md) |

Everything below was tested with scripted workers or simulated engines. None of it has been run
against a live engine yet, and the MVP three-arm experiment has not been run.

---

## Phase 2 — Project intelligence

**Exit condition met:** given "Change the seller payout API", Weave names the application, files,
symbols, dependencies, recent changes, API contracts and verification straight from the
repository, with no model call. A test checks this against a sample shop monorepo.

Stages, all in `packages/core/src/context/`:

1. **Scan:** files git tracks (respecting `.gitignore`), or a sorted folder walk outside git,
   capped at 20,000 files. Anything skipped is recorded with a reason.
2. **Workspaces and stack:** applications and packages from `workspaces` / `pnpm-workspace.yaml`,
   frameworks from dependencies, path aliases from tsconfig.
3. **Syntax parsing** (TypeScript compiler): symbols including class methods, imports, calls,
   Express-style routes, Next.js route files, `{ method, path }` contract objects, events.
4. **Dependency graph:** imports resolved through relative paths, `@/` aliases and workspace
   package names, plus which function calls which.
5. **Git history:** branch, HEAD, the last 100 commits and the files each touched.
6. **Architecture:** per-workspace file counts per layer (api, service, data, ui, state,
   contract, test, config).
7. **Query:** ranks files by matches in paths, symbols, routes and events; rare words weigh more.

Added in `aa04f5f`: `impact/` (reverse imports and calls, 3 hops, to dependents, callers, APIs,
tests), `update/` (re-parses only changed files and returns revision n+1 with a delta),
`docs/` (generated `architecture.md`, `apis.md`, `data-flow.md`) and `vectors/` (local TF-IDF
search over names, used when exact terms match nothing).

**In use:** every `/parallel` run on an existing project gives the planner an 8 KB summary of the
relevant files, APIs, dependencies, recent commits and test commands.

**Measured on this repo when built:** 1,351 files, 5,174 symbols, 2,793 imports, 3,372 call links,
12 unresolved imports. Build 1.6 s cold, 0.55 s warm (parses are cached by content hash).
Query 27 ms.

**Not built:** neural embeddings (needs an embedding provider and a store such as sqlite-vec).
Only JavaScript and TypeScript are parsed; other languages count toward the stack only.

**Open decision:** TypeScript moved from a dev dependency to a core runtime dependency, at the
same version. The desktop server bundle grew from 1.4 MB to 11.4 MB; the browser bundle is
unchanged. The alternative is to load TypeScript separately in the packaged app. Not decided.

---

## Phase 3 — Context intelligence

- **TaskState:** every field from `goal` through `engineState`, folded from the ledger. Workers
  add decisions, discoveries and open questions with a `taskNotes` JSON block. Older checkpoints
  are upgraded when read.
- **Skills:** a registry of built-in and project skills with a resolver. A backend task gets
  TypeScript, Node, backend/API and Postgres; a UI task gets frontend. Node and Postgres skills
  were added, and a specific skill replaces its generic one (Postgres over database). Chat picks
  skills per prompt instead of sending all of them.
- **Context builder:** facts → symbols → code excerpts → dependencies → rules → recent changes →
  skills → TaskState → task, each under its own byte budget (24 KB total), reporting what was cut.
- **Lifecycle and handoff:**
  - A policy maps context use and stop reasons through the stages, from normal to handoff.
  - Every attempt starts a fresh session whose prompt is rebuilt from the project model and
    TaskState, with a checkpoint between attempts.
  - Rate limits, quota errors and crashes move to the next engine. Max turns or a full context
    window restart the same engine with fresh context.
  - `/parallel` runs use the other installed engines as fallbacks.
- **Engines:** Gemini CLI (`--acp`; `--experimental-acp` is deprecated) and OpenCode (a native
  binary started with `opencode acp`, so native binaries can now be launched directly).

---

## Phase 4 — Coordination and live collaboration

**Exit condition met:** a dependent task consumes an intermediate artifact or contract without
waiting for its whole upstream task. Test: `pool/coordination.test.ts`.

- **Events:** employees publish structured events (`artifact.ready`, `contract.published`,
  `dependency.blocked`, `review.requested`, `escalation.created`, …), never free-form chat. Engines
  write a ` ```weave-event ` block, which Weave parses from the ledger stream.
- **Routing:** events go only to the inboxes of tasks that depend on the sender; Weave versions
  every artifact and contract.
- **Early start:** a dependent starts once its producer has published every `requiredOutputs`
  entry.
- **Ownership:** claims on files, directories, modules, symbols, APIs, events, schemas and other
  resources. An overlapping claim leaves the task blocked, not failed.
- **Dynamic dependencies:** `dependency.blocked` adds an edge mid-run. A cycle or a missing
  producer becomes an escalation.
- **Live updates:** updates that arrive while an engine works become its next prompt turn.
- **Safety:** a consumer fails if its producer failed or its artifact was replaced after it
  finished.

---

## Phase 5 — Adaptive orchestration

**Exit condition met, in simulation:** on 20 held-out scenarios per seed, across three seeds,
the adaptive policy beat the MVP heuristic. Wall time fell 10–13% and cost 41–51%, with no
scenario lost. The benchmark runs the real pool, worktrees and merges, but the engines are
**simulated**. Run it with `bun run --filter @weave/eval bench:orchestration`.

- **Historical learning:** success, speed, cost, startup and coordination overhead, conflict rate
  and verification time, read from run ledgers.
- **Engine routing:** candidates filtered by capability, then the fallback chain ordered by
  success per unit of time and cost.
- **Worker count:** the count that maximises time saved minus coordination, merge risk,
  verification and startup cost, from a critical-path schedule.
- **Critical path:** the pool launches ready tasks by critical-path priority.
- **Budgets:** project, run, task, employee and engine ceilings on cost (exact micro-dollars),
  tokens and time, enforced live.
- **Guard:** with fewer than 3 runs of history it keeps the MVP heuristic's plan.

---

## Phase 6 — AI employee runtime

Employees are configuration files (`.weave/employees/*.yaml|json`, a user directory, or six
built-ins), not classes. Each has identity, responsibilities, skills, rules, memory,
permissions, capabilities, an engine policy and a verification policy.

- **Registry:** project over user over built-in precedence, with `extends`. Every skipped file
  is reported.
- **Assignment:** the planner sees the roster; otherwise the resolver scores each employee.
- **Enforcement:** write scope, deployment, network and git commit permissions are enforced.
  Required verification rungs run before merge.
- **Memory and performance:** outcomes and notes are remembered per employee, and past success
  feeds assignment.
- **Not enforced yet:** read permissions.

Full format and behaviour: [EMPLOYEES](EMPLOYEES.md).
