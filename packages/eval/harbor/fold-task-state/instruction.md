# Implement `foldTaskState`

You are implementing one function in `src/state.ts`:

```ts
export function foldTaskState(
  events: readonly WeaveEvent[],
  goal: string,
  taskId: string,
): TaskState
```

`WeaveEvent` and `TaskState` are defined in `src/protocol/` — read those files
first, they are the whole contract. Do not edit anything under
`src/protocol/`.

## What this is for

`foldTaskState` reduces a stream of ledger events (one agent run, recorded as
raw ACP traffic plus a few structured events) into a `TaskState` snapshot. A
process can be killed at any point — `SIGKILL`, an OOM, the laptop lid closing
— and whatever reached the ledger must still fold into a usable state. That is
the whole point of the function, and it drives every rule below.

## Hard rules

1. **Pure.** No I/O, no `Date.now()`, no `Math.random()`. Same `events` array
   in, same `TaskState` out, every time. Two calls with the same input must
   produce deep-equal output.
2. **Never throw on a well-formed but incomplete event stream.** A truncated
   ledger (the process died mid-write) is the normal case, not an error case.
3. Fields you cannot fill from a pure fold over these events stay at their
   empty default — do not fabricate data:
   - `state.decisions` — always `[]`. Nothing in this event stream carries
     modeled intent; inventing it is worse than omitting it.
   - `state.git` — always `EMPTY_GIT_STATE` (exported from
     `src/protocol/continuation.ts`). Git status requires a shell-out, which a
     pure function cannot do.
   - `state.errors[].fatal` does not exist on this schema — do not add it.

## Field-by-field mapping

`events` is a stream of `WeaveEvent` (see `src/protocol/events.ts`). Only
these variants matter for this fold; ignore everything else (leave state
unchanged when you see an event type not listed below):

### `atSeq`
The `seq` of the **last** event in `events`. (Events arrive in order; you do
not need to sort.)

### `completed` / `inProgress` / `remaining`
Driven entirely by `agent.message` events whose `update.sessionUpdate ===
"plan"`. The `update` field on those events has this shape:

```ts
{
  sessionUpdate: "plan";
  entries: Array<{ content: string; status: "pending" | "in_progress" | "completed" }>;
}
```

Each `plan` update carries the **complete** entry list — replace
`completed`/`inProgress`/`remaining` wholesale from the latest one seen, do
not accumulate across multiple `plan` events. This is what makes the fold
idempotent when given a longer event list: folding `events` and folding
`events` with ten more `plan` updates appended must not double up completed
steps.

- `completed`: `content` of every entry with `status === "completed"`, in
  order.
- `inProgress`: `{ description: content }` of the (at most one) entry with
  `status === "in_progress"`, or `null` if there is none.
- `remaining`: `content` of every entry with `status === "pending"`.

### `files.read` / `files.modified` / `files.created` / `files.deleted`
Two sources, both de-duplicated (a path must never appear twice in the same
array):

1. Top-level `file.read` events → append `path` to `files.read`.
   Top-level `file.written` events → append `path` to `files.modified`.
2. `agent.message` events whose `update.sessionUpdate` is `"tool_call"` or
   `"tool_call_update"`. Both shapes carry (all fields optional on the
   `_update` variant except `toolCallId`):

   ```ts
   { toolCallId: string; title: string; kind?: string; status?: string; locations?: Array<{ path: string }> }
   ```

   Map `kind` → bucket:
   - `"read"`, `"search"`, `"fetch"` → `files.read`
   - `"edit"`, `"move"` → `files.modified`
   - `"delete"` → `files.deleted`
   - anything else (`"execute"`, `"think"`, `"switch_mode"`, `"other"`, or
     absent) → no file bucket.

   A `tool_call_update` for a `toolCallId` never seen in a prior `tool_call`
   in this same `events` array should still apply its `locations` (if any) —
   just don't crash and don't invent a `kind` you were not told.

### `commands` / `verification`
Both driven by `verification.rung` events:

```ts
{ type: "verification.rung"; rung: VerificationRung; strength: number; command: string; ok: boolean; wallMs: number; output?: string }
```

- Push `{ command, ok, wallMs, output }` onto `commands`.
- Push `{ rung, status: ok ? "passed" : "failed", wallMs }` onto
  `verification`.

Nothing else populates these two arrays — in particular, `tool_call`s with
`kind: "execute"` do **not** count (ACP carries no structured exit code for
those; only `verification.rung` is a deterministic result).

### `errors`
One `error` event → one `ErrorRecord`:

```ts
{ type: "error"; message: string; where: string }
```
→ `{ message, where, atSeq: <that event's seq> }`.

### `inFlight`
Tool calls that started (`tool_call`) and never reached a terminal status
(`"completed"` or `"failed"`) by the end of `events`. This is the part a
transcript dump cannot give you: if the process died between `tool_call` and
its terminal `tool_call_update`, the file it names may be half-written.

Track open calls by `toolCallId`:
- On `tool_call`: open an entry `{ toolCallId, title, kind, locations: [...paths], startedAtSeq: <this event's seq> }`. If this same event's `status` is already terminal, don't open it (nothing to track).
- On `tool_call_update`: if `status` is terminal, close (remove) the entry for
  that `toolCallId`. Otherwise, merge in whatever fields it carries
  (`title`/`kind`/`locations`) onto the existing open entry. If there is no
  open entry for that id (an update with no matching `tool_call` in this
  slice of events), do nothing — do not fabricate a `startedAtSeq`.
- `state.inFlight` at the end is every entry still open, in any order.

## Worked example

Given this event sequence (abbreviated — real events also carry
`runId`/`at`/`taskId`, irrelevant here):

```
seq 1  task.started        prompt: "Build a Todo API"
seq 2  agent.message       plan: [Scaffold server: completed, Implement POST /todos: in_progress]
seq 3  agent.message       tool_call  tc-1  "Edit server.ts"  kind edit  status in_progress  locations [apps/api/src/server.ts]
seq 4  agent.message       tool_call_update  tc-1  status completed
seq 5  file.written        apps/api/src/server.ts
seq 6  verification.rung   rung typecheck  command "tsc --noEmit"  ok true  wallMs 1200
seq 7  error               message "permission denied on first attempt"  where "tool_call:tc-2"
seq 8  agent.message       tool_call  tc-2  "Edit todos.ts"  kind edit  status in_progress  locations [apps/api/src/todos.ts]
```
(process killed here — no further events)

`foldTaskState(events, "Build a Todo API", "T1")` must equal:

```ts
{
  schemaVersion: 1,
  taskId: "T1",
  goal: "Build a Todo API",
  atSeq: 8,
  completed: ["Scaffold server"],
  inProgress: { description: "Implement POST /todos" },
  remaining: [],
  files: {
    read: [],
    modified: ["apps/api/src/server.ts", "apps/api/src/todos.ts"],
    created: [],
    deleted: [],
  },
  commands: [{ command: "tsc --noEmit", ok: true, wallMs: 1200 }],
  verification: [{ rung: "typecheck", status: "passed", wallMs: 1200 }],
  decisions: [],
  errors: [{ message: "permission denied on first attempt", where: "tool_call:tc-2", atSeq: 7 }],
  inFlight: [{
    toolCallId: "tc-2",
    title: "Edit todos.ts",
    kind: "edit",
    locations: ["apps/api/src/todos.ts"],
    startedAtSeq: 8,
  }],
  git: { branch: null, baseCommit: null, headCommit: null, dirty: [] },
}
```

## Constraints

- Edit only `src/state.ts`.
- `npm run typecheck` must pass with zero errors.
- Do not add dependencies — `typescript` and `@types/node` are already in
  `package.json` and that is all you get.
