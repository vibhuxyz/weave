# Findings

Things that were not obvious and cost real debugging time. Written down so
they are not rediscovered.

---

## The agent sends more than you first render

Three separate bugs, one shape. Each time the instinct was to *add* something;
each time the fix was to **stop discarding what was already arriving**.

**1. The model list.** `newSession().models` is empty — Claude Code never
populates it. Everything is in `configOptions`:

```
mode   → auto, default, acceptEdits, plan, dontAsk, bypassPermissions
model  → default, sonnet, claude-fable-5[1m], opus, haiku
effort → default, low, medium, high, xhigh, max
fast   → on, off
```

That is also why Berd's `setModel` calls `setSessionConfigOption`, not a model
API. Driving `configOptions` works for any ACP agent; a hardcoded model list
works for none.

**2. Tool titles.** A tool call opens with a placeholder and is refined later:

```
tool_call        → title: "Terminal"
tool_call_update → title: "ls /Users/…/src",  rawInput: { command: "ls …/src" }
```

Reading only `status` from updates made every shell step render as "Terminal".
Every field on an update is optional — some arrive as literally `{}` — so
merge with `?? existing`, never overwrite.

**3. `filesWritten` empty on a successful fix.** Claude Code has its **own**
Edit tool: it asks permission, then writes directly. Nothing routes through
ACP's `writeTextFile`. An eval harness scoring on `filesWritten` would mark
working fixes as no-ops. `filesChanged` (git before/after) is the deterministic
signal.

**Rule:** before building around something that looks missing, dump the raw
payload.

---

## Spawned ≠ ready

`Command::spawn()` returns when the process exists, not when it is listening.
The renderer dialled into that gap, got `ECONNREFUSED`, and gave up silently —
no connection ever appeared in `lsof`, which made it look like the renderer had
never run.

Fixed on both sides, because either alone is fragile:

- **Rust** polls the port before reporting success, and `try_wait()`s the child
  so a crash surfaces immediately instead of hanging for the full timeout.
- **Renderer** retries on `close`, not `error` — a refused socket fires both,
  but only `close` is guaranteed by the spec.

---

## Persist a session id only after a turn completes

The agent writes a session to disk on first content. Recording the id at
creation time meant launching without chatting poisoned it, and the next launch
failed with `Resource not found` and silently started over.

Verified all three paths: launch-without-chatting stores nothing; chat then
relaunch resumes and replays.

`loadSession` replays the full transcript into a **new** agent process, so
persistence here is one sessionId per project — no transcript buffer of our own.

---

## Permission options are not ordered

`kind` is `allow_once | allow_always | reject_once | reject_always`. Match on
kind, never `options[0]` — pick a reject and the agent asks forever while
writing nothing.

`clientCapabilities.fs.writeTextFile: true` is the other half; without it the
agent can only suggest.

On a permission request, `toolCall` is a `ToolCallUpdate` — **every field is
optional**, including `title`. Fall back to `toolCallId`.

---

## Some agent settings are model-dependent

`effort` and `fast` work on Opus and are refused on Haiku, reported as a bare
`Internal error`. So an optimistic UI update needs a rollback, or a pill shows a
value the agent never accepted.

---

## `.berd/` pollutes its own results

The runtime directory lives inside the repo being worked on, so every run showed
as an untracked change — in `filesChanged`, in the Changes panel, and in any
diff the agent is asked to review.

Fixed by writing `.berd/.gitignore` containing `*`: the directory ignores
itself and its own marker, without touching the target repo's config.

---

## Node quirks

- `--experimental-strip-types` is **strip-only**: no constructor parameter
  properties (`constructor(private readonly x: T)`).
- `require.resolve("@agentclientprotocol/claude-agent-acp")` returns
  `dist/lib.js` (the library) via `exports["."]`. The ACP server is the **bin**,
  `dist/index.js`. Read `bin[name]` from the manifest — this generalises to
  every engine in the registry.

---

## Moving a Tauri app invalidates its Rust build cache

After `git mv src-tauri apps/desktop/src-tauri`, the build script still
referenced the pre-move absolute path and failed on a missing permissions file.
`rm -rf target` and rebuild. Costs one full compile.

---

## Redis was never the answer

Measured before optimising:

```
server module import                  160 ms
bind the port                           3 ms
websocket open                         12 ms
agent spawn + handshake + newSession  1464 ms   ← only local cost
prompt → first token                  1786 ms   ← Anthropic's API
```

One user, one machine, no shared state, no repeated expensive read — nothing
for a cache or a queue to do. First-token latency is not local; the only lever
is the model.

The profile's real finding was a **correctness** bug, not slowness: every
reconnect created a new session, so conversations vanished silently. Fixed with
`loadSession`, which the agent had advertised all along.

**Measuring first is what stopped an optimisation from being installed to fix a
data-loss bug.**
