# Architecture

How the pieces fit, and why the seams are where they are.

> **Naming.** The product is **Weave**. The code is not renamed yet: packages
> are `@berd/*`, the CLI is `berd`, runtime output is `.berd/`. Every path here
> is the real one. The rename is tracked in [V1](V1.md) under V1.1.

Tiers: [V1](V1.md) · [CONTINUATION](CONTINUATION.md) · [MVP](MVP.md) ·
[V2](V2.md) · [V3](V3.md) · [V4](V4.md) ·
[ROADMAP](ROADMAP.md) · [LADDER](LADDER.md) · [FINDINGS](FINDINGS.md)

---

## 1. The one rule

```
protocol  ←  agent  ←  core  ←  cli
                        ↑
                     desktop
```

**Nothing points back.** `packages/core` must never import from
`apps/desktop`, from `@tauri-apps/*`, or from React.

The reason is not tidiness. V1.1 is an eval harness that runs 12 fixtures × 2
configs × 3 repeats unattended, possibly overnight. If that path goes through a
desktop window it will not be run often, and then there are no numbers, and the
whole ladder collapses. The UI has to be the last consumer of the core, never
its host.

A quick way to check the rule still holds:

```bash
grep -rn "@tauri-apps\|from \"react\"\|apps/desktop" packages/ --include=*.ts
# must return nothing
```

---

## 2. The packages

### `protocol` — types only, zero runtime deps

- `acp.ts` — ACP wire types, re-exported. Every other package imports ACP types
  from here, so an SDK version bump has exactly one file to notice.
- `events.ts` — the `BerdEvent` union. **This is the ledger schema.**
- `task.ts` — `TaskContract`, `TaskResult`, `TaskStatus`.
- `config.ts` — `RunConfig` (engine, model, mode, effort, fast, `maxTurns`,
  `timeoutMs`), the knobs the eval harness sweeps, plus `DEFAULT_RUN_CONFIG`.
- `eval.ts` — `Fixture`, `CellResult`, `CellSummary`, `CellStatus`. The eval
  vocabulary lives here so `core` and `eval` agree without importing each other.

### `agent` — one engine process, nothing more

- `engines-registry.ts` / `engines.ts` — registry of supported engines (`antigravity`,
  `claude-code`, `codex`, `amp`), their manifests, capability flags, and CLI arguments.
- `engine-capabilities.ts` — `EngineCapabilities`, `EngineTokenReporting`, and the
  per-engine declared capability data. Split out of `engines-registry.ts` once the
  capability dimensions from the "control plane" checklist (`planning`, `subagents`,
  `skills`, `sandbox`, `browser`, `computerUse`) were added — see §10.
- `capability-check.ts` — `describeCapabilityMismatch`, comparing the live
  `agentCapabilities` ACP reports at `initialize` against the declared registry.
- `policy.ts` — `TaskPolicy` → `PermissionPolicy` translation: `compilePolicyPaths`
  folds `filesystem.write` into `TaskContract.allowedPaths`; `withPolicy` adds
  command-pattern checks for `git.commit` and `deployment.allowed` on top of a base
  policy (`confineToTaskDir` by default). `network.allowed` is recorded, not
  enforced — see §10.
- `supervisor.ts` — `EngineSupervisor`. Keeps warm engine child processes and manages
  per-session engine switches with prompt supersession.
- `auth.ts` — engine authentication handling: terminal login runners (`runTerminalAuth`),
  API keys, OAuth, and ACP `authenticate` dispatch.
- `spawn.ts` — resolve the bin from its manifest, probe PATH via interactive shell,
  spawn child processes, handle EPIPE.
- `session.ts` — `initialize · newSession · loadSession · prompt · cancel`, plus
  the ACP client (permission, file I/O). Supports multimodal `PromptBlock[]` (text
  and images) and handles `AuthRequiredError`.
- `permissions.ts` — `PermissionPolicy`, `confineToTaskDir` (now also inspects
  shell command *strings* for `..` traversal and credential-dir references,
  not just `toolCall.locations`), `rejectAll`, `isInside` (symlink-resolving —
  see [FINDINGS](FINDINGS.md)). `permissions.test.ts` covers the boundary.
- `engines.ts` / `engines-registry.ts` — `resolveEngineArgs` makes
  `--no-sandbox` conditional per project/task; a `sandboxed` task on macOS is
  additionally wrapped in `sandbox-exec` with kernel-level deny rules.
- `config-options.ts` — apply `model`/`mode`/`effort`/`fast`, report refusals.

`agent` knows nothing about ledgers or runs. It emits through a sink; who
records it is someone else's decision.

### `core` — the orchestrator

Built:

- `ledger.ts` — append-only `events.ndjson`, plus readers.
- `runner.ts` — run one task end to end; turn sink callbacks into events;
  enforce `maxTurns` and `timeoutMs`.
- `sessions-store.ts` — which conversation belongs to which project.
- `git.ts` — branch and porcelain status.
- `skills.ts` — discovers `.weave/skills/` (and `.agents/skills/`), each a
  folder with a `SKILL.md`; renders a pointer catalog for the system prompt.
  Task-matched, read on demand — the body is never loaded until a skill's
  description matches what the agent is about to do.
- `rules.ts` — discovers `.weave/rules/` (and `.agents/rules/`), flat
  Markdown files this time, not folders — a rule is small enough to inline
  wholesale. Renders `<project-rules>`, standing constraints applied on every
  turn rather than a catalog consulted on demand. A rule that outgrows "small"
  belongs in `skills.ts` instead.
- `agents/` — `BUILTIN_AGENTS`: six portable, provider-neutral role profiles
  (frontend/backend/database/devops/AI engineer, reviewer), one file per role
  plus a shared `types.ts` and `base.prompt.ts` (priority order, trust rules,
  scope, and the DONE/BLOCKED report format every profile's prompt is built
  from). Data plus a formatter; not wired into the desktop's separate
  user-editable Persona store.
- `builtin-skills/` — `BUILTIN_SKILLS`: seven short skills Weave ships itself
  (typescript, frontend, backend, api-conventions, database, security, testing),
  one file per skill, rendered as `<builtin-skills>` with bodies inlined. Kept
  separate from `skills.ts`'s pointer catalog because the shapes differ —
  inline body vs. read-on-demand file.
- `worktree.ts` — `createWorktree` / `removeWorktree` / `listWeaveWorktrees`:
  a task's isolated execution boundary, `git worktree add -b weave/<taskId>`
  under `.weave/worktrees/<taskId>`. Single-task only — no pool, no scheduler,
  no auto-merge; that is the integrator, still MVP.1.
- `task-workspace.ts` — `resolveTaskWorkspace`, the one decision `runner.ts`
  defers to: isolate into a worktree, or run in place. Kept out of `runner.ts`
  itself to keep that file's diff small for this change.

Built since MVP, one folder per feature (detail in the linked docs):

- `coordination/` — the live task graph ([V2.1](V2.md)). `Coordinator` versions artifacts and
  contracts, routes structured employee events to the inboxes of dependent tasks, holds
  ownership claims (file, directory, module, symbol, api, event, schema, resource) and adds
  dependencies mid-run. Engine employees publish by writing a ` ```weave-event ` block, which
  Weave parses from the ledger stream. There is no free-form agent chat.
- `adaptive/` — adaptive orchestration ([V3.1](V3.md)). `history/` folds run ledgers into
  statistics per engine and per task kind, `routing/` orders each task's engine fallback chain,
  `workers/` picks the worker count from the expected benefit, `estimate/` holds the
  critical-path schedule, and `budget/` enforces cost (bigint micro-USD), token and time ceilings
  live. `policy/` combines them into one logged decision.
- `employees/` — the AI employee runtime ([EMPLOYEES](EMPLOYEES.md)). Config parsing (a strict
  YAML subset plus JSON), the registry with `extends`, resolver, assignment, prompt brief,
  verification policy, memory and performance. The `agents/` profiles above now feed the
  built-in employees' instructions.

`planAndRun` turns the last two on with `adaptive` and `employees` options; coordination is
always on inside the pool.

Planned, by tier — each tier file has the detail:

| Tier | Files |
|---|---|
| [V1.1](V1.md) | `intake.ts` · `verify.ts` |
| [V1.2](CONTINUATION.md) | `state.ts` · `checkpoint.ts` · `handoff.ts` · `tasks-store.ts` |
| [MVP.1](MVP.md) | `worktree.ts` · `pool.ts` · `scheduler.ts` · `integrator.ts` · `compress.ts` |
| [MVP.2](MVP.md) | `planner.ts` · `blueprint.ts` · `contracts.ts` · `decide.ts` |
| [V2.1](V2.md) | built as `coordination/` |
| [V2.2](V2.md) | `context/` — `scan · model · graph · docs · index · update · retrieve · impact` |
| [V3.1](V3.md) | built as `adaptive/` |
| [V3.2](V3.md) | `supervisor.ts` · `policy.ts` · `replay.ts` |

`contracts.ts` generates a contract package **inside the target repo**. It is
not a new workspace member here — the "a new version adds a file to an existing
package" rule still holds.

### `cli` — how you actually drive it

`berd run | eval | replay | runs`. This is V1.0's acceptance surface and stays
the primary one; the desktop is a convenience.

`INIT_CWD` is honoured, because `pnpm -F @berd/cli start` runs with cwd =
`packages/cli` and `--dir .` would otherwise silently mean the wrong directory.

### `eval` — the harness

- `load.ts` — read a fixtures file, resolving every path relative to the file
  itself, so the set works from any working directory including a cron.
- `harness.ts` — `runCell` (copy → inject → precondition → run → restore →
  verify) and `runMatrix` (fixtures × configs × repeats, **sequential**).
- `score.ts` — `runVerify`, and `summarize` collapsing repeats into median and
  min–max.
- `report.ts` — the matrix, plus a "Not scored" section for anything that is
  neither pass nor fail.

Fixtures live in `packages/eval/fixtures/`: `tasks.json`, `repos/` (fixture
sources), `inject/` (harness-owned files, e.g. a test suite the repo lacks).

### `apps/desktop`

React + Tauri. Built in three layers:

1. **`server/index.ts` — WebSocket adapter.** Bridges the UI to `@weave/agent`
   and `@weave/core`. Holds a long-lived session (many prompts, streaming, cancel),
   driving `openSession` and `EngineSupervisor`. Owns:
   - Live engine switching with warm child reuse and in-flight prompt supersession.
   - In-band engine authentication: receives `start-auth` / `cancel-auth` from the UI,
     runs terminal logins or API key submissions, and broadcasts `auth-state` snapshots.
   - Multimodal prompt formatting: turns images and per-image instructions into `PromptBlock[]`.
   - `<system>` preamble composition: persona framing + skills catalog (`discoverSkills`,
     `formatSkillCatalog`) + project-level context.
   - `@file` fuzzy search (`list-files` -> `files`).
2. **React UI surfaces:**
   - `HomeView`: canvas view with project overview and widgets.
   - `ChatView`: transcript rendering with `StreamedTurn` (`agent/components/stream/`)
     and `UserMessage`. An assistant turn streams in arrival order: narration as
     markdown, consecutive tool calls as one collapsible group, a files-changed card,
     and a live status line. Running tasks open `TasksPanel` (`agent/components/tasks/`). `<plan>` output is normalised to `PlanBlockEntry[]`
     (`agent/normalize/messageToBlocks.ts`) and shown via `PlanBlockView`;
     `PlanApprovalModal` lets the user edit/reorder/re-prioritise steps, then
     the edited plan (or rejection feedback) is sent back as the next prompt —
     engine-agnostic because it never calls an engine API.
   - `AgentsView` & `SkillsView`: persona management and skill plugins.
   - `EnginePicker`, `ProvidersDialog`, and `EngineAuthPanel`: engine selection,
     install status, and credential/terminal sign-in.
   - `ContextPanel`: project git status, running dev servers with stop controls,
     standing and manual project agents, and a native file tree
     (`features/chat/ui/FilesList.tsx` over a Tauri directory-listing command).
   - `UsageLimitIsland`: live model rate limit and spend quota monitor.
   - `ImageLightbox`: screenshot attachment preview and full-screen view.
3. **`src-tauri/src/lib.rs` — Native host layer:**
   - Spawns and supervises the Node ACP server on port 8137.
   - Dev server discovery with system listener exclusion (macOS AirPlay receiver).
   - Process tree termination: `kill_port` recursively terminates child processes (`pgrep -P`)
     to eliminate orphaned dev server workers.

---

## 3. The ledger

`.berd/runs/<runId>/events.ndjson` — one JSON object per line, append-only.

Design choices worth keeping:

- **Synchronous writes.** An async queue drops its tail when the process
  crashes — exactly the run whose log matters most.
- **Raw payloads.** `agent.message` carries the ACP notification verbatim.
  Deriving a friendlier shape is a reader's job; discarding the original is
  unrecoverable.
- **Self-ignoring.** `.berd/.gitignore` contains `*`, so the directory hides
  itself from the repo it lives in — without touching that repo's config.
  Without this, every run shows as an untracked change and pollutes any diff the
  agent is asked to review.
- **Never optional.** Everything later — replay, cost accounting, observability,
  the event bus at V2.1, debugging why agent 4 touched a file — is a reader over
  this file. It costs one `appendFileSync`.

Current event types:

```
run.started · run.finished
task.started · task.finished · task.timeout
agent.spawned · agent.session · agent.message (raw ACP) · engine.capabilities (raw ACP)
permission.requested · permission.decided
file.read · file.written
usage · cell.finished · error
intake.detected · verification.rung · verification.finished
plugin.activated
attempt.started · attempt.ended · checkpoint.created
worktree.created · worktree.removed · worktree.installed · worktree.harvested
plan.created · task.skipped · pool.task.settled · merge.finished · integration.finished
contract.changed · contract.change.rejected
coordination.event · coordination.rejected · dependency.added · consumer.invalidated
ownership.claimed · ownership.blocked · ownership.released
orchestration.decided · budget.exceeded
employee.assigned · employee.verified · employee.memory.recorded
```

The event bus at V2.1 is exactly this reader: `Ledger.subscribe()` feeds the coordinator,
budget manager and employee-event parser. It adds no broker and no second log.

Every event carries `runId`, `seq`, `at`, and where applicable `taskId` — so a
multi-agent log can be split per task after the fact. That is what makes MVP.1's
lanes a reader, not a second stream.

---

## 4. Boundaries that enforce path confinement

They are independent on purpose, because they catch different things:

1. **`PermissionPolicy`** inspects `toolCall.locations` and rejects anything
   outside `task.cwd`. Catches the agent's *own* tools (Claude Code's Edit,
   Bash) which never route through our client.
2. **`safeResolve`** in `session.ts` refuses out-of-tree paths in
   `readTextFile` / `writeTextFile`. Catches ACP-routed I/O.
3. **`confineToTaskDir` command-string inspection** — for the many tool calls
   that report no `locations` (shell commands especially), the command string
   itself is scanned for `..` traversal and references to credential dirs
   (`~/.ssh`, `~/.aws`, `~/.gnupg`) and rejected before it runs.
4. **`sandbox-exec`** (macOS, `sandboxed` tasks only) — a kernel-level deny
   wrapper on the engine child as defence in depth, plus conditional
   `--no-sandbox` via `resolveEngineArgs`.

The first two are not sufficient alone — which is why `filesWritten` can be
empty on a successful fix while `filesChanged` (from git) is not.

**Known gap, recorded not hidden:** command-string inspection is still
inspection, not containment — it narrows the hole the vacuous location check
left (reason string: `no locations reported (unverified)`) but does not close
it. The real answer is MVP.1's worktrees.

---

## 5. Verification (V1.1, not yet built)

Today a task carries an optional `verify` shell command and a fixture hardcodes
one. That is rung 1 by hand.

The ladder replaces it: detect which rungs a project actually supports, run the
strongest, and **record which one was used**.

```
1 tests · 2 typecheck · 3 lint · 4 build · 5 boot · 6 health · 7 smoke · 8 diff-review
```

- `intake.ts` detects availability once, at project intake.
- `verify.ts` runs the strongest available rung and returns a `Verification`
  — `{ available, used, strength }`.
- `Verification` becomes a field on `TaskResult`, a ledger event, and a
  **bucketing dimension in the eval report**. A rung-5 pass and a rung-1 pass
  are not the same result and must never be averaged.
- **Never refuse a repo for having no tests.** Offer to add a smoke script;
  never impose one.

Integration at MVP.1 uses the same ladder: merge one task, verify, merge the
next onto that, verify. Stop at the first failure and name the task that broke
it. That is the whole of "semantic conflict detection" — anything smarter is a
research project.

---

## 6. Task states

`TaskStatus` today is `pending | running | ok | failed | cancelled`. The runner
already distinguishes a tripped cap (`cancelled` plus a `task.timeout` event),
which the harness maps to a `timeout` cell status.

The full machine lands with the scheduler at MVP.1:

```
PLANNED ──► READY ──► RUNNING ──► VERIFYING ──► DONE
                │         │            │
                │         ├──► WAITING ─┘        (dependency not yet satisfied)
                │         ├──► BLOCKED           (resource owned by another task)
                │         ├──► TIMEOUT
                │         ├──► FAILED ──► RECOVERABLE ──► READY
                │         └──► NO_CHANGE_NEEDED  (terminal, successful)
                └──► CANCELLED
```

What is real today: `BLOCKED` is a pending task whose ownership claim overlaps a running task
(`ownership.blocked`); it starts when the owner settles. `WAITING` ends early when the producer
publishes every `requiredOutputs` entry, not only when it finishes. A consumer whose producer
failed, or whose artifact was replaced after it finished, becomes `failed`
(`consumer.invalidated`). A budget stop is `cancelled` with the budget as the reason, and a task
whose employee fails its verification policy is `failed` before merge. `VERIFYING`,
`RECOVERABLE` and `NO_CHANGE_NEEDED` per task are still not separate states.

`NO_CHANGE_NEEDED` is terminal **and successful** — "the described bug does not
exist" is a valid result, and scoring it as a failure is how a system learns to
edit something regardless. Every transition is a ledger event; the state machine
is a projection over the ledger, not separate state to keep in sync.

---

## 7. Desktop specifics

**Rust owns one thing:** spawn the Node server, wait for the port to accept,
remember the chosen folder. 170 lines. Berd's `goose_serve.rs` is 1,682 because
Berd's Rust owns `goosed`, a whole agent host.

**Spawned ≠ ready.** `Command::spawn` returns when the process exists, not when
it is listening. Rust polls the port (and `try_wait()`s so a crash surfaces
instead of hanging), and the renderer retries on `close` — not `error`, since
only `close` is guaranteed by the spec.

**`reference/`** (1,822 files) is excluded from every tsconfig and from Vite's
watcher. With it included, dev-server startup degrades with every package added.
Currently ~240ms.

**`useAcpChat` is one transcript.** MVP.3's lanes did not rewrite it: a separate
run channel (`features/runs/`) folds the `planAndRun` ledger stream, projected by
`server/parallel-run/`, into lanes keyed by `taskId`. `/parallel <request>` starts a run.

---

## 8. Storage, and what stays local

Local through V3. Postgres + pgvector + Redis are a V4 answer, for the reason
[FINDINGS](FINDINGS.md) recorded: one user, one machine, no shared state, no
repeated expensive read.

| Need | Through V3 | V4 |
|---|---|---|
| Event history | `.berd/runs/*/events.ndjson` (built) | same, plus shipping |
| Task / run state | SQLite `.berd/state.db` | Postgres |
| Worker liveness | in-process registry + child `exit` | heartbeats + leases + fencing |
| Locks / ownership | in-memory map in `core` | Redis |
| Vector index | `sqlite-vec` or a flat file | pgvector |

Design the interfaces now — every write carries a `leaseId`, every worker has an
id independent of its process — and implement none of it until a worker runs
somewhere you cannot watch it exit.

**Everything written at runtime goes under `.berd/`.** Worktrees, event logs,
diffs, metrics, context cache. One gitignore line, one directory to delete when
state gets weird, and the same path whether the desktop or the CLI is driving.

---

## 9. Why there is no Goose

Berd's UI calls **113** `_goose/unstable/*` extension methods — sessions,
archive, rename, projects, providers, config. `goosed` is not "the Goose
agent"; it is Berd's database and settings server.

This app copies Berd's *design system* and speaks plain ACP:

```
initialize · newSession · loadSession · prompt · cancel · setSessionConfigOption
```

Six calls instead of 113.

---

## 10. Weave is a control plane, not a re-implementation

Worth saying explicitly, because it is easy to mistake this system for "three
prompts to three CLIs": Weave does not rebuild the planner, permissions,
skills, agents, or MCP handling that Claude Code / Codex / Gemini already
have. It orchestrates above them, and translates its own engine-neutral
concepts into each engine's native mechanism. This has been true since V1.0;
this section names it.

| Weave owns | Translated by / into | File |
|---|---|---|
| Engine-neutral session lifecycle | ACP itself — `initialize · newSession · prompt · cancel` — the same six calls regardless of which engine is behind the process | `agent/session.ts`, `agent/supervisor.ts` |
| Which engines exist, what each can do | `EngineDescriptor` / `EngineCapabilities` — a capability flag per engine, not a hardcoded `if (provider === …)` | `agent/engines-registry.ts` |
| Whether a plugin's commands/skills/agents/MCP/hooks/LSP survive on a given engine | `planActivation()` → `ActivationPlan` — resolved per (plugin, engine) pair into what's natively enabled, what falls back to an MCP adapter, and what becomes prose instructions | `core/plugins/resolve.ts` |
| Project-wide standing constraints, portable across engines | `rules.ts` — `<project-rules>`, inlined; the same file works whichever engine is running | `core/rules.ts` |
| Task-matched expertise, portable across engines | `skills.ts` — a pointer catalog every engine gets the same way | `core/skills.ts` |
| What a tool call is allowed to touch | `PermissionPolicy` — a policy Weave owns, translated to each ACP response via `toAcpResponse` | `agent/permissions.ts` |
| What happened, durably, engine-agnostic | The ledger — raw ACP payloads, verbatim | `core/ledger.ts`, `protocol/events.ts` |
| What state a task is in right now | `foldTaskState()` — a pure fold over the ledger, not a second source of truth an engine could drift from | `core/state.ts` |
| Whether a result is actually correct | The verification ladder — engine-agnostic; it never asks the engine whether it succeeded | `core/intake.ts`, `core/verify.ts` |
| Carrying a task across engines mid-flight | `buildBrief()` — a bounded, trust-sectioned handoff, not a transcript dump | `core/handoff.ts`, `core/checkpoint.ts` |

The reason "engine adapter layer" cost almost nothing to build here is that
ACP already *is* that layer for the six calls above — see §9. What Weave adds
on top is the part ACP doesn't cover: deciding which plugin capabilities are
real on a given engine, translating a project's policy into that engine's
permission responses, and keeping a durable, engine-agnostic record of what
actually happened so a task can move engines without losing what it knew.

Updated since this section was first written:

- **Per-task workspace isolation** is now built — `core/worktree.ts` +
  `core/task-workspace.ts`, opt-in via `RunTaskOptions.isolate` /
  `weave run --isolate`. Deliberately single-task: no pool, no scheduler, no
  auto-merge. `TaskContract.allowedPaths` is now enforced accordingly
  (`agent/permissions.ts`), closing the precondition [MVP.1](MVP.md) named for
  it. The rest of MVP.1 — the pool, the scheduler, the integrator — is still
  not built and still gated behind the item below.
- **Capability discovery** is now live-checked for the one dimension ACP
  actually reports (`resume`, cross-checked against `agentCapabilities.loadSession`
  at `initialize` — `agent/capability-check.ts`, the `engine.capabilities`
  ledger event). The Weave-specific dimensions (`planning`, `subagents`,
  `skills`, `sandbox`, `browser`, `computerUse`) have no ACP wire
  representation at all and stay hand-declared — see `engine-capabilities.ts`'s
  doc comment.
- **Declarative policy** now exists (`protocol/policy.ts`, `agent/policy.ts`):
  filesystem-write and git-commit/deployment dimensions are real; `network` is
  recorded but not enforced (see `policy.ts`'s doc comment) — true network
  isolation needs a process-level sandbox boundary, which is a separate,
  larger change.

Still genuinely not done, and still not an oversight:

- **MVP.1's pool/scheduler/integrator** — multiple concurrent workers,
  sequential merge-and-verify. See [ROADMAP](ROADMAP.md) §3.5 and §"the tier
  rule".
- **The V1 exit-criteria baseline itself** — `weave eval` runs the full
  12-fixture × ≥2-config × ≥3-repeat matrix mechanically today, but that
  matrix has not actually been executed end to end (real API cost and wall
  clock). See [V1](V1.md) "Exit criteria for V1".
