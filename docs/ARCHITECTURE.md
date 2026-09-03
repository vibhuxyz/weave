# Architecture

How the pieces fit, and why the seams are where they are.

> **Naming.** The product is **Weave**. The code is not renamed yet: packages
> are `@berd/*`, the CLI is `berd`, runtime output is `.berd/`. Every path here
> is the real one. The rename is tracked in [V1](V1.md) under V1.1.

Tiers: [V1](V1.md) · [MVP](MVP.md) · [V2](V2.md) · [V3](V3.md) · [V4](V4.md) ·
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

- `engines.ts` — the registry. The only file that names an engine.
- `spawn.ts` — resolve the bin from its manifest, spawn, handle EPIPE.
- `session.ts` — `initialize · newSession · loadSession · prompt · cancel`,
  plus the ACP client (permission, file I/O) that reports through a `SessionSink`.
- `permissions.ts` — `PermissionPolicy`, `confineToTaskDir`, `rejectAll`,
  `isInside` (symlink-resolving — see [FINDINGS](FINDINGS.md)).
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

Planned, by tier — each tier file has the detail:

| Tier | Files |
|---|---|
| [V1.1](V1.md) | `intake.ts` · `verify.ts` |
| [MVP.1](MVP.md) | `worktree.ts` · `pool.ts` · `scheduler.ts` · `integrator.ts` · `compress.ts` |
| [MVP.2](MVP.md) | `planner.ts` · `blueprint.ts` · `contracts.ts` · `decide.ts` |
| [V2.1](V2.md) | `ownership.ts` · `bus.ts` · `state.ts` |
| [V2.2](V2.md) | `context/` — `scan · model · graph · docs · index · update · retrieve · impact` |
| [V3.1](V3.md) | `routing.ts` · `budget.ts` · `scale.ts` · `critpath.ts` |
| [V3.2](V3.md) | `supervisor.ts` · `checkpoint.ts` · `policy.ts` · `replay.ts` |

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

React + Tauri. `server/index.ts` is a **WebSocket adapter**: no spawn logic, no
permission decisions, no file I/O. It holds a long-lived session (many prompts,
streaming, cancel), which is why it drives `openSession` directly rather than
core's one-shot `runTask`. Both write the same ledger.

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
agent.spawned · agent.session · agent.message (raw ACP)
permission.requested · permission.decided
file.read · file.written
usage · cell.finished · error
```

Every event carries `runId`, `seq`, `at`, and where applicable `taskId` — so a
multi-agent log can be split per task after the fact. That is what makes MVP.1's
lanes a reader, not a second stream.

---

## 4. Two boundaries that enforce path confinement

They are independent on purpose, because they catch different things:

1. **`PermissionPolicy`** inspects `toolCall.locations` and rejects anything
   outside `task.cwd`. Catches the agent's *own* tools (Claude Code's Edit,
   Bash) which never route through our client.
2. **`safeResolve`** in `session.ts` refuses out-of-tree paths in
   `readTextFile` / `writeTextFile`. Catches ACP-routed I/O.

Neither is sufficient alone — which is why `filesWritten` can be empty on a
successful fix while `filesChanged` (from git) is not.

**Known gap, recorded not hidden:** many tool calls report no `locations` at
all, so the policy passes vacuously and says so in its reason string
(`no locations reported (unverified)`). Inspection is not containment. The real
answer is MVP.1's worktrees.

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

**`useAcpChat` is one transcript.** MVP.3 makes it a map keyed by `taskId`. That
is the single change that turns the chat window into a multi-worker view.

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
