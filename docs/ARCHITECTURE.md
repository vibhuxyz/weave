# Architecture

How the pieces fit, and why the seams are where they are.

---

## 1. The one rule

```
protocol  ←  agent  ←  core  ←  cli
                        ↑
                     desktop
```

**Nothing points back.** `packages/core` must never import from
`apps/desktop`, from `@tauri-apps/*`, or from React.

The reason is not tidiness. V0.1 is an eval harness that runs 10 tasks × 3
configs unattended, possibly overnight. If that path goes through a desktop
window it will not be run often, and then there are no numbers, and the whole
ladder collapses. The UI has to be the last consumer of the core, never its
host.

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
- `config.ts` — `RunConfig`, the knobs the eval harness sweeps.

### `agent` — one engine process, nothing more

- `engines.ts` — the registry. The only file that names an engine.
- `spawn.ts` — resolve the bin from its manifest, spawn, handle EPIPE.
- `session.ts` — `initialize · newSession · loadSession · prompt · cancel`,
  plus the ACP client (permission, file I/O) that reports through a `SessionSink`.
- `permissions.ts` — `PermissionPolicy`, `confineToTaskDir`, `rejectAll`.
- `config-options.ts` — apply `model`/`mode`/`effort`/`fast`, report refusals.

`agent` knows nothing about ledgers or runs. It emits through a sink; who
records it is someone else's decision.

### `core` — the orchestrator

- `ledger.ts` — append-only `events.ndjson`, plus readers.
- `runner.ts` — run one task end to end; turn sink callbacks into events.
- `sessions-store.ts` — which conversation belongs to which project.
- `git.ts` — branch and porcelain status.

Later, per the ladder: `worktree.ts`, `pool.ts`, `scheduler.ts`,
`integrator.ts`, `planner.ts`, `ownership.ts`, `impact.ts`, `replay.ts`,
`context/`, `routing.ts`.

### `cli` — how you actually drive it

`berd run | replay | runs`. This is V0.0's acceptance surface and stays the
primary one; the desktop is a convenience.

### `eval` — the harness

`harness.ts` (N tasks × M configs), `score.ts` (does `verify` pass?),
`report.ts`. Fixtures live in `packages/eval/fixtures/`.

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
  itself from the repo it lives in — without touching that repo's config. Without
  this, every run shows as an untracked change and pollutes any diff the agent
  is asked to review.
- **Never optional.** Everything later — replay, cost accounting, observability,
  debugging why agent 4 touched a file — is a reader over this file. It costs
  one `appendFileSync`.

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

---

## 5. Desktop specifics

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

---

## 6. Why there is no Goose

Berd's UI calls **113** `_goose/unstable/*` extension methods — sessions,
archive, rename, projects, providers, config. `goosed` is not "the Goose
agent"; it is Berd's database and settings server.

This app copies Berd's *design system* and speaks plain ACP:

```
initialize · newSession · loadSession · prompt · cancel · setSessionConfigOption
```

Six calls instead of 113.
