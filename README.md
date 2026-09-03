# Weave

An agent orchestrator with a desktop UI. Berd's interface, my own backend,
**no Goose**.

One agent by default. Split into several only when parallelism has a real
benefit — and the harness, not taste, decides when that is.

The orchestrator runs headless. The desktop app is one consumer of it, not
its host.

```bash
pnpm install
pnpm dev                                              # the whole stack
pnpm weave run --dir ./repo --prompt "fix the bug"    # no window needed
pnpm weave eval --fixtures packages/eval/fixtures/tasks.json
```

`pnpm dev` frees ports 5180/8137 first, then starts Tauri — which starts Vite,
which starts the Rust shell, which spawns the Node ACP server and the agent.

> **Naming.** Packages are `@weave/*`, the CLI is `weave`, runtime output is
> `.weave/`. The rename (V1.1 item) is done in the orchestrator; the desktop
> app's own branding (logo, locale copy, Tauri bundle id) is a separate,
> deliberately untouched decision.

---

## Where this is going

```
V1    Single-agent engineering workspace          ← V1.0 shipped, V1.1 in progress
 ↓
MVP   Basic parallel multi-agent execution
 ↓
V2    Intelligent coordinated multi-agent system
 ↓
V3    Production-grade autonomous engineering platform
 ↓
V4    Distributed / team / cloud platform
```

**Every tier is independently usable.** Stop at the end of any one and you have
a product someone could run, not a half-built version of the next.

| Tier | What it adds | Status |
|---|---|---|
| **[V1](docs/V1.md)** | runner · ledger · permissions · intake · verification ladder · eval harness | shipped |
| **[MVP](docs/MVP.md)** | worktrees · pool · scheduler · integrator · planner · blueprint · contracts · lanes UI | not started |
| **[V2](docs/V2.md)** | ownership · event bus · dynamic deps · context model · impact · dashboard | not started |
| **[V3](docs/V3.md)** | routing · budgets · adaptive scale · supervisor · checkpoints · sandboxing | not started |
| **[V4](docs/V4.md)** | remote workers · leases · fencing · Postgres · Redis · multi-user | gated |

**Two gates can send the plan backwards.** End of V1: does the matrix report per
verification rung, unattended? End of MVP: does N-worker parallel match 1-worker
sequential on pass rate? If not, **ship the sequential version** — see the
three-arm experiment in [MVP](docs/MVP.md).

Docs: [ROADMAP](docs/ROADMAP.md) — the verdict and the design changes ·
[LADDER](docs/LADDER.md) — the status board ·
[ARCHITECTURE](docs/ARCHITECTURE.md) · [FINDINGS](docs/FINDINGS.md)

---

## The four cases it has to handle

The real spec, written from the user's side rather than the system's:

| | Simple | Complex |
|---|---|---|
| **New** | blueprint → 1 worker → build → smoke | blueprint → contracts → N workers → integrate → smoke |
| **Existing** | context → retrieve → 1 worker → verify | context → impact → DAG → N workers → dynamic deps → integrate → verify |

**Greenfield is a first-class path, not an edge case.** If you build products by
prompting, most first runs have no repo to understand, no tests to run, and no
code graph to walk. Half the intelligence layer does not apply on run one.

**And the greenfield paths are the riskiest, not the safest.** No tests means no
regression net; contract drift between four workers is caught by nothing except
typecheck and a smoke run. The *simpler-looking* scenarios need the *stronger*
verification story.

---

## Layout

```
packages/
  protocol/   types only, zero runtime deps                 verification, task, eval
  agent/      one ACP engine: spawn, session, permissions   + readOnlyPaths, globs
  core/       orchestrator: runner, ledger, git, intake, verify
  cli/        weave run | eval | replay | runs | intake
  eval/       harness, scoring, report, fixtures — 12 fixtures, build-gated
apps/
  desktop/    Tauri + React                        288 server · 170 Rust · 1,073 UI
reference/    Berd's src, read-only, 1,822 files — copy from, never import
.weave/       runtime output, gitignored
```

**Dependency direction:**

```
protocol  ←  agent  ←  core  ←  cli
                        ↑
                     desktop
```

Nothing points back. `core` must never import from `apps/desktop` or
`@tauri-apps/*`. That single rule is what keeps the eval harness runnable from
a script at 3am, which is the only way it ever gets run often enough to
produce numbers.

---

## How a turn runs

```
Tauri window ──ws:8137──▶ desktop/server ──▶ @weave/core ──▶ @weave/agent
      or                  (transport only)     (ledger)      (spawn + ACP)
  weave CLI ─────────────────────────────────────┘                │
                                                          stdio (ndjson)
                                                                  ▼
                                                        claude-agent-acp
                                                                  │ https
                                                                  ▼
                                                        api.anthropic.com
```

Both entry points write the same ledger. The desktop is a **reader** over the
event stream the CLI writes, not a second implementation of it.

---

## The ledger

Every run appends to `.weave/runs/<runId>/events.ndjson`, one JSON object per
line, never rewritten.

```
run.started · run.finished
task.started · task.finished · task.timeout
agent.spawned · agent.session · agent.message (raw ACP)
permission.requested · permission.decided
file.read · file.written
usage · cell.finished · error
```

Writes are **synchronous** on purpose: an async queue drops its tail when the
process crashes, which is exactly the run whose log matters most.

`agent.message` stores the raw ACP payload verbatim. Deriving a nicer shape is
a reader's job; throwing the original away is unrecoverable.

Every event carries `runId`, `seq`, `at` and — where it applies — `taskId`, so
a multi-agent log splits per task after the fact. That is what makes MVP's
per-worker lanes a reader rather than a second stream.

```bash
pnpm weave runs   --dir ./repo
pnpm weave replay <runId> --dir ./repo
```

Replay, cost accounting, "why did agent 4 touch that file", the V2 event bus,
and the eval harness are all readers over this one file.

---

## Verification: never refuse a repo for having no tests

A repo with no test suite still has verifiable behaviour. Weave walks down a
ladder and uses the strongest rung the project actually supports:

```
1  tests            pnpm test            (if a test script exists)
2  typecheck        tsc --noEmit         (if tsconfig exists)
3  lint             eslint               (if configured)
4  build            next build / tsc     (almost always available)
5  boot             process starts and stays up N seconds
6  health           docker compose up --wait; GET /health → 200
7  smoke            scripted request flow
8  diff review      structural sanity: no deleted exports, no orphan files
```

**Verification strength is a first-class field**, on the result and in the
ledger. A rung-5 pass is not a rung-1 pass, and the eval harness must never
average them together.

For greenfield, the smoke flow *is* the acceptance test — generated from the
blueprint at plan time, not after the code lands, when it would just
rationalise whatever got built.

**Status:** built. `core/src/intake.ts` detects the 8 rungs; `core/src/verify.ts`
runs them (command / boot-and-hold / structural diff-review) and reports which
one validated the result. `weave intake` inspects a repo
without running an agent.

---

## The eval harness

Without numbers, every later choice is taste. The harness is the instrument;
it gets built before the thing it measures.

```bash
pnpm weave eval --fixtures packages/eval/fixtures/tasks.json --repeats 3
```

The report is **sectioned by verification rung, strongest first** — never one
table averaging across rungs:

```
Rung 4 — build
fixture         sonnet                     haiku
--------------------------------------------------------------
calc-bugfix     3/3 <median> [min-max]     3/3 <median> [min-max]
                $0.15                      $0.05
```

12 fixtures × 2 configs × 3 repeats = 72 cells is the exit-criterion run; one
real cell (`calc-bugfix`, haiku, 1 repeat) has been run end to end as a smoke
test — 1/1 pass, scored at `build (4)`, `readOnlyPaths` held. The full matrix
has not been run yet.

Five things decide whether those numbers mean anything:

1. **Repeats ≥ 3 per cell.** Agent runs are nondeterministic. One run per cell
   measures noise — and adding repeats later invalidates every baseline
   collected before it.
2. **Fresh copy per cell.** `git checkout .` leaves untracked files;
   `git clean -fdx` takes `node_modules`. Copy to temp, run, discard.
3. **Cheat resistance.** "Does `verify` pass" is passable by editing the test.
   Harness-owned files are restored pristine before verification runs — and the
   same paths belong in `readOnlyPaths` so the policy refuses them too.
4. **Bucket by verification strength.** Never average a rung-1 pass with a
   rung-5 pass.
5. **Sequential execution.** Wall clock is a metric; parallel cells contend for
   CPU and rate limits and stop comparing. Parallelism is the thing being
   measured, not the thing to measure with.

**All five are built.** `readOnlyPaths` is now two independent defences — the
permission policy rejects tool calls that report those locations, *and* the
harness restores them from the pristine source repo before verifying, which
catches what the policy cannot (most shell commands report no `locations` at
all). Summaries bucket by verification strength, not just fixture × config.
The fixture set is 12: 4 bugfix, 2 feature, 2 refactor, 2 greenfield scaffold,
1 no-test repo, 1 noop-trap — the `calc-*` pair are the two that were always
"proving" fixtures, kept because they're cheap and still useful as a smoke
check on the harness itself.

---

## The experiment that decides the product

Before building MVP's coordination machinery, three arms on the same fixtures:

```
A  one agent, one prompt, whole repo context
B  planner splits into tasks, ONE worker runs them sequentially
C  planner splits into tasks, N workers run them in parallel
```

Scoped decomposition shrinks each model call's context, and smaller context
usually means better adherence. **That benefit is independent of running the
tasks at the same time.** So B may already capture most of the quality win at
none of the coordination cost.

Ship parallel only if **C matches A and B on pass rate** at equal verification
rung. Faster and less correct is a failure. If B ≈ C, the product is scoped
decomposition and parallelism is an optional accelerator — a smaller, more
reliable system, and the honest answer.

---

## Engines

`packages/agent/src/engines.ts` is the **only** place an engine is named.
Adding one is a row plus an npm install, not an adapter.

| id | package | status |
|---|---|---|
| `claude-code` | `@agentclientprotocol/claude-agent-acp` | installed |
| `codex` | `@agentclientprotocol/codex-acp` | binary confirmed |
| `amp` | `@sourcegraph/amp` | declared |
| `gemini` | `@google/gemini-cli --experimental-acp` | binary confirmed |

**Declared is not the same as a completed task.** `codex`'s row named a
deprecated package (`@zed-industries/codex-acp` → `@agentclientprotocol/codex-acp`,
found by probing the ACP handshake directly) — fixed. `gemini`'s binary
resolves and answers the ACP wire; it failed on a Google account-tier error
before a task could run. Actually finishing a task on either needs an API key
this environment doesn't have, so that half stays a hypothesis — tracked in
[FINDINGS](docs/FINDINGS.md).

**Engines are agents, not models.** Claude Code, Codex, Amp and Gemini CLI each
ship an ACP server. DeepSeek is a *model* — reach it through an agent's `model`
setting, or write a thin ACP server for it, which is where the registry would
plug in.

---

## Permissions

Not cleanup — on the critical path. With one agent and a human watching,
auto-approve was survivable. With N agents running unattended it is the only
thing between a plan and `rm -rf`, and nobody is at the window.

```ts
type PermissionPolicy = (task, request) => { decision: "allow" | "reject"; reason: string }
```

The default, `confineToTaskDir`, rejects any tool call whose `locations` fall
outside the task's `cwd`. Every decision is logged with its reason:

```
allow  Edit math.js — allow_always; within task cwd
```

Match on `kind` (`allow_once` / `allow_always` / `reject_*`), never
`options[0]` — the order is the agent's choice.

**Infrastructure is the security boundary, never the LLM.** And inspection is
not containment: many tool calls report no `locations` at all, so the check
passes vacuously and says so in its reason string. The real answer is MVP's
worktrees.

---

## What works

| | |
|---|---|
| **Headless runs** | `weave run` fixes bugs on disk with no window |
| **Execution ledger** | Every raw ACP message, replayable |
| **Eval harness** | Repeats, per-cell isolation, anti-cheat restore, caps |
| **Run caps** | `maxTurns` (tool calls) and `timeoutMs`, cancel and report |
| **Desktop app** | Three panes, Berd's design system |
| **Conversations resume** | Quit mid-chat, reopen, it's still there |
| **Agent settings** | model · mode · effort · fast, read from the agent |
| **Tool steps** | Collapsible, showing the actual command |
| **Git context** | Branch + changed files, refreshed each turn |
| **Path confinement** | Enforced in the policy *and* in file I/O |
| **Verification ladder** | 8 rungs, detected and scored, never refuses a repo for having no tests |
| **12-fixture eval set** | bugfix · feature · refactor · greenfield × 2 · no-test repo · noop-trap |
| **`readOnlyPaths`** | Enforced by the policy *and* restored from pristine — two independent defences |
| **Commit pin** | Checked against source HEAD before the copy, or the cell is `invalid-fixture` |

### Not built

**[MVP](docs/MVP.md)+** — multi-agent pool · worktrees · scheduler · planner ·
blueprint · contracts · integrator, then [V2](docs/V2.md)'s context model and
ownership, then [V3](docs/V3.md)'s routing and supervisor.

`allowedPaths` narrowing stays deferred to [MVP.1](docs/MVP.md) — an allow-list
is only meaningful once each task owns a worktree.

**UI** — onboarding · Agents/Skills/Settings screens (rendered, disabled) ·
multiple saved chats · file tree · packaged build that doesn't need `node` on
PATH.

---

## Scripts

| | |
|---|---|
| `pnpm dev` | **everything** — clears stale ports, then the full stack |
| `pnpm dev:web` | Vite only, in a browser, no agent |
| `pnpm dev:server` | the ACP server alone (`PROJECT_DIR=/path`) |
| `pnpm weave …` | the CLI: `run` · `eval` · `replay` · `runs` · `intake` |
| `pnpm eval` | shorthand for `weave eval` |
| `pnpm typecheck` | all six packages |
| `pnpm build` · `pnpm tauri build` | bundle / `.app` |

---

## The rules

1. One agent by default; split only when it has real benefit.
2. **Measure before adding a component.**
3. Never refuse a project for lacking tests — verify at the strongest rung it
   supports, and record which one.
4. Dependencies are fine-grained: split the task, don't stop it.
5. Contracts are owned by the orchestrator; changing one is an event, not an edit.
6. Never rely on agents to avoid conflicts themselves.
7. Enforce ownership outside the LLM.
8. Give every worker isolated execution.
9. Share project knowledge, not write access.
10. Update context incrementally, and version it.
11. Retrieve only relevant context; compress tool output.
12. Budget tokens and money per task.
13. Route by measured evidence, not taste.
14. Scale worker count to actual workload.
15. Re-plan when reality diverges from the plan.
16. Never blindly retry — classify the failure first.
17. **Integrate sequentially, verifying after each merge.**
18. `NO_CHANGE_NEEDED` is a success.
19. Infrastructure is the security boundary, never the model.
20. Keep a complete execution ledger, always, never optional.

### Two more that keep the repo scalable

21. **A new version adds a file to an existing package**, not a new top-level
    folder. If something fits none of protocol / agent / core / cli / eval /
    desktop, that is a signal to think — not to create `packages/utils`.

22. **Everything written at runtime goes under `.weave/`.** Worktrees, event
    logs, diffs, metrics, context cache. One gitignore line, one directory to
    delete when state gets weird, and the same path whether the desktop or the
    CLI is driving.

---

## History

```
4f11ff5  pnpm dev runs the whole stack
f31b854  V1.1 (part): eval harness with repeats, isolation, anti-cheat, caps
4335acb  Docs: architecture, ladder, findings
278bf8a  V1.0: move to a pnpm workspace; extract the orchestrator from the app
5c25fb8  Update README to what actually exists
b65e565  Show what each tool step actually did
f56ab91  Resume conversations instead of losing them on every connect
a650ef3  Three-pane shell, agent settings pills, git context panel
5b61e44  Render tool calls as collapsible steps, like Berd
9758710  Berd UI + own ACP backend, no Goose
```
