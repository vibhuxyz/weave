# my-berd-app

A Tauri desktop app that talks to Claude Code directly over ACP.

Berd's UI, my own backend, **no Goose**.

---

## How it runs

```
Tauri window (WKWebView)          src/          React 19 + Berd's design system
      │  ws://127.0.0.1:8137
      ▼
Node ACP server                   server/       spawns the agent, speaks ACP
      │  stdio (newline-delimited JSON)
      ▼
claude-agent-acp                  node_modules  the agent — none of it is mine
      │  https
      ▼
api.anthropic.com                               my Claude auth
```

**Rust owns exactly one thing:** spawn the Node server, wait for it to bind,
remember which folder was picked. 170 lines. Berd's `goose_serve.rs` is 1,682,
because Berd's Rust owns `goosed` — a whole agent host. Mine owns a node script.

**The agent is not code I wrote.** `@agentclientprotocol/claude-agent-acp` is a
standalone ACP server on npm. Spawn it, speak five protocol methods, done.

### Why no Goose

Berd's UI calls **113** `_goose/unstable/*` extension methods — sessions,
archive, rename, projects, providers, config. `goosed` is not "the Goose
agent", it's Berd's database and settings server. Reimplementing it was never
the goal, so this app copies Berd's *design system* and speaks plain ACP:

```
initialize · newSession · loadSession · prompt · cancel
+ setSessionConfigOption
```

Six calls instead of 113.

---

## What works

| | |
|---|---|
| **Fixes bugs on disk** | Not suggestions — real writes, verified |
| **Project picker** | Native folder dialog, remembered across launches |
| **Conversations resume** | Quit the app mid-chat, reopen, it's still there |
| **Agent settings** | model · mode · effort · fast, read from the agent |
| **Tool steps** | Collapsible, showing the actual command run |
| **Git context** | Branch + changed files, refreshed after every turn |
| **Sandboxed** | The agent cannot touch anything outside the project folder |

### Not built

Onboarding · Agents / Skills / Settings screens (rendered but disabled) ·
multiple saved chats (one per project) · a file tree · permission prompts in
the UI · a packaged build that doesn't need `node` on PATH.

---

## Run

```bash
pnpm install
pnpm tauri dev      # the desktop app
```

First launch asks for a project folder.

| Script | |
|---|---|
| `pnpm tauri dev` | the app |
| `pnpm dev` | just the Vite page in a browser (no agent) |
| `pnpm server` | just the ACP server; set `PROJECT_DIR` |
| `pnpm typecheck` | `tsc --noEmit` — clean |
| `pnpm tauri build` | a real `.app` (still needs `node` on PATH) |

---

## Layout

```
src/                  the UI
  shared/             230 files copied from Berd, imports unchanged
    ui/               123 components, incl. ai-elements
    i18n/             Berd's real i18n + locale files
    styles/globals.css  Berd's Tailwind 4 theme tokens
  App.tsx             three-pane shell
  useAcpChat.ts       WebSocket → transcript
  useProject.ts       folder picker → Rust → server restart
  ToolSteps.tsx       collapsible tool steps
  ConfigPicker.tsx    one pill per agent setting
  ContextPanel.tsx    Context / Changes / Files
  Sidebar.tsx         nav, project, chats
server/index.ts       the ACP server (528 lines)
src-tauri/            the desktop shell (170 lines of Rust)
reference/            full copy of Berd's src/ (1,822 files)
```

**~1,700 lines mine. 230 files copied.** `@/` is aliased to `src/` exactly as
in Berd, so anything else pulled out of `reference/` keeps its imports and
just works.

---

## Things that were not obvious

Each of these cost real debugging time. Written down so they aren't
rediscovered.

### The agent sends more than you first render

Twice the fix was *stop discarding data*, not *add a feature*:

- **Model list.** `newSession().models` is empty — Claude Code never populates
  it. Everything is in `configOptions` (`model`, `mode`, `effort`, `fast`).
  That's also why Berd's `setModel` calls `setSessionConfigOption`. Driving
  configOptions works for any ACP agent; a hardcoded model list works for none.
- **Tool titles.** A tool call opens with a placeholder (`"Terminal"`,
  `"Read File"`) and is refined in `tool_call_update` (`"ls src"`,
  `"Read src/paths.ts"`). Reading only `status` from those updates made every
  shell step render identically.

### Spawned ≠ ready

`Command::spawn()` returns when the process exists, not when it is listening.
The renderer dialled into that gap, got `ECONNREFUSED`, and gave up silently.
Fixed on both sides: Rust polls the port before reporting success (and checks
`try_wait()` so a crash surfaces instead of hanging for the full timeout), and
the renderer retries on `close` — not `error`, since only `close` is guaranteed.

### Persist a session only after it has a turn

The agent writes a session to disk on first content. Storing the id at
creation meant launching without chatting poisoned it, and the next launch
failed with `Resource not found` and silently started over.

### Permission options are not ordered

`kind` is `allow_once | allow_always | reject_once | reject_always`. Match on
kind, never `options[0]` — pick a reject and the agent asks forever while
writing nothing. `clientCapabilities.fs.writeTextFile: true` is the other half;
without it the agent can only suggest.

### Some settings are model-dependent

`effort` and `fast` work on Opus and are refused on Haiku, reported as a bare
`Internal error`. Optimistic UI updates therefore need a rollback, or a pill
will show a value the agent rejected.

### Two Node quirks

- `--experimental-strip-types` is strip-only: no constructor parameter
  properties.
- `require.resolve("@agentclientprotocol/claude-agent-acp")` gives
  `dist/lib.js` (the library) via `exports["."]`. The ACP server is the **bin**,
  `dist/index.js`. Read it from the manifest.

---

## Measured, not guessed

```
server module import                  160 ms
bind the port                           3 ms
websocket open                         12 ms
agent spawn + handshake + newSession  1464 ms   ← the only local cost
prompt → first token                  1786 ms   ← Anthropic's API
```

**No Redis, no queue, no cache.** One user, one machine, no shared state, no
repeated expensive read — there is nothing for them to do. First-token latency
is not local; the only lever is the model pill.

The profile's real finding was a correctness bug, not slowness: every reconnect
created a new session, so conversations vanished. Fixed with `loadSession`,
which the agent already advertised.

---

## Seams deliberately cut

- `openSessionDeepLink.ts` — Berd's dispatches through the berdctl registry,
  which pulls in most of the app. Stubbed.
- `shared/types/messages.ts` — two Goose DTO imports replaced with local types.
- `shared/types/providers.ts` — deleted; nothing imported it.
- `@tauri-apps/api` stays a dependency because a few copied components import
  it. Harmless: `invoke()` only throws if actually called.

---

## History

```
b65e565  Show what each tool step actually did
f56ab91  Resume conversations instead of losing them on every connect
a650ef3  Three-pane shell, agent settings pills, git context panel
5b61e44  Render tool calls as collapsible steps, like Berd
9758710  V0: Berd UI + own ACP backend, no Goose
```

## Next

1. **Delete the server's auto-approve.** Permissions are decided both in
   `UiClient.requestPermission` and by the `mode` pill. Two sources of truth;
   the pill is the honest one.
2. **Multiple chats per project.** The agent advertises
   `sessionCapabilities.list`, so the Chats sidebar is a `listSessions` call
   away.
3. **Bundle Node** so `pnpm tauri build` produces something that runs on a
   machine without it — Berd solves this with `node-runtime.lock.json` +
   `managed_node.rs`.
