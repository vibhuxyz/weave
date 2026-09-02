# my-berd-app

An agent orchestrator with a desktop UI. Berd's interface, my own backend,
**no Goose**.

The orchestrator runs headless. The desktop app is one consumer of it, not
its host.

```bash
pnpm install
pnpm tauri dev                                        # the app
pnpm berd run --dir ./repo --prompt "fix the bug"     # no window needed
```

---

## Layout

```
packages/
  protocol/   types only, zero runtime deps        165 lines
  agent/      one ACP engine: spawn, session, permissions   556
  core/       orchestrator: runner, ledger, git    393
  cli/        berd run | replay | runs             191
  eval/       harness, scoring, reports             93
apps/
  desktop/    Tauri + React                        288 server · 170 Rust · 1,073 UI
reference/    Berd's src, read-only, 1,822 files — copy from, never import
.berd/        runtime output, gitignored
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

Docs: [ARCHITECTURE](docs/ARCHITECTURE.md) · [LADDER](docs/LADDER.md) ·
[FINDINGS](docs/FINDINGS.md)

---

## How a turn runs

```
Tauri window ──ws:8137──▶ desktop/server ──▶ @berd/core ──▶ @berd/agent
      or                  (transport only)     (ledger)      (spawn + ACP)
   berd CLI ─────────────────────────────────────┘                │
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

Every run appends to `.berd/runs/<runId>/events.ndjson`, one JSON object per
line, never rewritten.

```
task.started · agent.spawned · agent.session · agent.message (raw ACP)
permission.requested · permission.decided · file.read · file.written
task.finished · run.finished
```

Writes are **synchronous** on purpose: an async queue drops its tail when the
process crashes, which is exactly the run whose log matters most.

`agent.message` stores the raw ACP payload verbatim. Deriving a nicer shape is
a reader's job; throwing the original away is unrecoverable.

```bash
pnpm berd runs   --dir ./repo
pnpm berd replay <runId> --dir ./repo
```

Replay, cost accounting, "why did agent 4 touch that file", and the eval
harness are all readers over this one file.

---

## Engines

`packages/agent/src/engines.ts` is the **only** place an engine is named.
Adding one is a row plus an npm install, not an adapter.

| id | package | status |
|---|---|---|
| `claude-code` | `@agentclientprotocol/claude-agent-acp` | installed |
| `codex` | `@zed-industries/codex-acp` | declared |
| `amp` | `@sourcegraph/amp` | declared |
| `gemini` | `@google/gemini-cli --experimental-acp` | declared |

Verify `binName` against each package's own manifest before trusting it — a
package's `exports["."]` usually points at its library, while the ACP server
is the `bin`.

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

---

## What works

| | |
|---|---|
| **Headless runs** | `berd run` fixes bugs on disk with no window |
| **Execution ledger** | Every raw ACP message, replayable |
| **Desktop app** | Three panes, Berd's design system |
| **Conversations resume** | Quit mid-chat, reopen, it's still there |
| **Agent settings** | model · mode · effort · fast, read from the agent |
| **Tool steps** | Collapsible, showing the actual command |
| **Git context** | Branch + changed files, refreshed each turn |
| **Path confinement** | Enforced in the policy *and* in file I/O |

### Not built

Multi-agent pool · worktrees · scheduler · planner · impact analysis ·
onboarding · Agents/Skills/Settings screens (rendered, disabled) · multiple
saved chats · file tree · packaged build that doesn't need `node` on PATH.

---

## Scripts

| | |
|---|---|
| `pnpm tauri dev` | the desktop app |
| `pnpm dev` | Vite only, no agent |
| `pnpm berd …` | the CLI |
| `pnpm eval` | the harness |
| `pnpm typecheck` | all six packages |

---

## Two rules that keep this scalable

1. **A new version adds a file to an existing package**, not a new top-level
   folder. If something fits none of protocol / agent / core / cli / eval /
   desktop, that is a signal to think — not to create `packages/utils`.

2. **Everything written at runtime goes under `.berd/`.** Worktrees, event
   logs, diffs, metrics, context cache. One gitignore line, one directory to
   delete when state gets weird, and the same path whether the desktop or the
   CLI is driving.

---

## History

```
278bf8a  Move to a pnpm workspace; extract the orchestrator from the app
5c25fb8  Update README to what actually exists
b65e565  Show what each tool step actually did
f56ab91  Resume conversations instead of losing them on every connect
a650ef3  Three-pane shell, agent settings pills, git context panel
5b61e44  Render tool calls as collapsible steps, like Berd
9758710  V0: Berd UI + own ACP backend, no Goose
```
