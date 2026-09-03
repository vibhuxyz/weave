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

## `/var` vs `/private/var` made a good model look bad

The first eval matrix said Sonnet failed a trivial bugfix 0/4 while Haiku
passed it. The conclusion would have been "Sonnet is worse at this". The
ledger said otherwise:

```
touches /private/var/folders/…/repo/src/calc.js,
outside          /var/folders/…/repo
```

On macOS `/var` is a symlink to `/private/var`. `mkdtemp` returns `/var/…`;
the agent reports the realpath `/private/var/…`. `isInside` compared them
lexically and rejected every write inside the task's own directory.

`isInside` now resolves symlinks on both sides, walking up to the nearest
ancestor that exists (the file being created does not yet).

**Two lessons, and the second is the bigger one:**

- Path containment must compare *real* paths. Lexical comparison is a bug
  wherever symlinks exist, which on macOS is the temp directory.
- **A benchmark's first surprising result is usually a bug in the benchmark.**
  The number was produced by the harness, so it was evidence about the harness
  before it was evidence about the model. Checking the ledger cost two minutes;
  publishing "Sonnet is worse" would have cost the project its credibility.

After the fix: 3/3 for both models on both fixtures.

---

## Permission checks pass vacuously without `locations`

Related to the above, and worse. Many tool calls report no `locations` at all —
a shell command, for instance. The policy inspects `toolCall.locations`, so for
those it has nothing to check and allows unconditionally.

That is why Haiku "passed" the broken matrix: it reached for a tool that
reported no locations, and sailed past the check that was blocking Sonnet.

The decision reason now says so explicitly (`no locations reported
(unverified)`), so the ledger never implies a check happened that did not.

**Inspection is not containment.** The real boundary for those calls is the
agent's cwd, enforced by `safeResolve` — and by MVP.1's worktrees, which is the
actual answer.

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

---

## A field can be documented as enforced and read by nothing

Found by audit, not by debugging — which is the only reason it did not cost a
day later. Three fields carry a doc comment describing a guarantee, and no code
reads any of them:

| Field | The comment says | The code does |
|---|---|---|
| `Fixture.readOnlyPaths` | "the permission policy rejects tool calls touching these" | Nothing reads it. Only restore-before-verify is live. |
| `TaskContract.allowedPaths` | "so the policy has something to consult that is not yes" | Nothing reads it. `confineToTaskDir` checks the task cwd and nothing narrower. |
| `Fixture.commit` | "the harness checks HEAD matches before running" | Nothing reads it — and `copyRepo` deletes `.git`, so it could not check afterwards. Fixtures are not pinned. |

The `readOnlyPaths` one is the dangerous one. `tasks.json` says the anti-cheat
story is **two independent defences** — the policy refusing the path, and the
harness restoring the file. Only the second exists. The claim reads as true, the
fixtures pass, and the number is still real today because restore alone happens
to be sufficient. It stops being sufficient the moment a fixture verifies on
something the harness does not own.

**Two lessons:**

- A type is a plan, not a mechanism. `grep` for the field before believing the
  comment above it. This is the same shape as the vacuous-permission gap: a
  check that *looks* like containment and only inspects.
- The dangerous documentation is the kind that is *nearly* true. "Not
  implemented" is safe; "implemented differently than described" is what gets
  trusted and then breaks silently.

Wired up in V1.1 and MVP.1. Recorded here rather than quietly fixed, because
the failure mode — believing your own doc comment — will happen again.

## `codex-acp` was pointing at a deprecated package

`packages/agent/src/engines.ts` named `@zed-industries/codex-acp` for the
`codex` row. Probed directly (spawn + a raw ACP `initialize`, no API key
needed — that handshake is answered before any model call): the package
refuses to resolve. `pnpm view` says why — it was replaced by
`@agentclientprotocol/codex-acp` months ago. Fixed the row; `binName` still
matches (`codex-acp` in both).

`gemini`'s row checked out clean the same way: the binary resolves, `--experimental-acp`
is accepted, and the process replies over the ACP wire. It failed on an
account-tier error from Google (`IneligibleTierError`, unrelated to Weave) before
a task could run — full engine verification needs a Gemini or Codex API key
this environment does not have, so "an agent actually completes a task" is
still unverified for both. The debt list in [V1](V1.md) is honest about that;
this closes the narrower "is the registry row even a real package" half.
