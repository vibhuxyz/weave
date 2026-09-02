# my-berd-app

Berd's UI, your own ACP backend. **No Goose.**

A Tauri desktop app that talks to Claude Code directly over ACP.

## How it runs

```
Tauri window (WKWebView)          src/          React + Berd's design system
      │  ws://127.0.0.1:8137
      ▼
Node ACP server                   server/       spawns the agent, speaks ACP
      │  stdio (newline-delimited JSON)
      ▼
claude-agent-acp                  node_modules  the agent — you write none of it
      │  https
      ▼
api.anthropic.com                               your Claude auth
```

Rust (`src-tauri/`) owns exactly one thing: it spawns and kills the Node
server, and remembers which folder you picked. Same shape as Berd owning
`goosed` — much smaller job.

**Why the agent is not code you wrote:** `@agentclientprotocol/claude-agent-acp`
is a standalone ACP server on npm. You spawn it and speak 5 protocol methods.
That is the whole "backend".

## Run

```bash
pnpm install
pnpm tauri dev      # the desktop app
```

First launch asks for a project folder. Claude reads and edits files **inside
that folder only** — `safeResolve()` in `server/index.ts` refuses paths outside it.

Other scripts:

```bash
pnpm dev            # just the Vite page in a browser (no Tauri, no agent)
pnpm server         # just the ACP server; PROJECT_DIR=/path/to/repo
pnpm typecheck      # tsc --noEmit — clean
pnpm tauri build    # a real .app
```

## Layout

```
src/              the UI
  shared/ui/      123 components copied from Berd, imports unchanged
  shared/i18n/    Berd's real i18n + locale files
  shared/styles/globals.css   Berd's Tailwind 4 theme tokens
  App.tsx         project picker + chat
  useAcpChat.ts   WebSocket → transcript
  useProject.ts   folder picker → Rust → server restart
server/index.ts   the ACP server (spawn, permissions, file I/O, WebSocket)
src-tauri/        the desktop shell (Rust; ~150 lines)
reference/        full copy of Berd's src/ (1,822 files) — copy more from here
```

`@/` is aliased to `src/`, same as Berd, so anything you copy out of
`reference/` keeps its original import paths and just works.

## The parts that matter

**Permissions** (`server/index.ts`). Before the agent writes a file it asks.
We auto-approve — but by matching `kind === "allow_always" | "allow_once"`,
never by picking `options[0]`. Pick a reject kind and the agent asks forever
and never edits anything.

**File capabilities.** `clientCapabilities.fs.writeTextFile: true` in
`initialize`. Set it false and Claude can read and suggest but never apply a fix.

**The five update kinds** are the whole transcript contract:
`agent_message_chunk` · `tool_call` · `tool_call_update` · `agent_thought_chunk` ·
`plan`. V0 renders the first three.

## Verified working

Pointed at a repo containing:

```js
// BUG: add() multiplies instead of adding.
export function add(a, b) { return a * b; }
```

Prompt: *"There is a bug in math.js: add() multiplies instead of adding. Fix it."*
Result: the file on disk became `return a + b;` with the stale comment removed.

## Seams deliberately cut

- `openSessionDeepLink.ts` — Berd's version dispatches through the berdctl
  registry, which pulls in most of the app. Stubbed.
- `shared/types/messages.ts` — two Goose DTO imports replaced with local types.
  There is no Goose here.
- `shared/types/providers.ts` — deleted; nothing imported it.
- `@tauri-apps/api` stays a dependency because a few copied components import
  it. Harmless: `invoke()` only throws if actually called.

## Not built yet

Onboarding · session history · persistence (close the app, the chat is gone) ·
multiple sessions · agent personas · model picker · permission prompts in the UI ·
bundled Node for a packaged build (`pnpm tauri build` produces an app that needs
`node` on PATH).
