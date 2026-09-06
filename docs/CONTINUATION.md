# Continuation — one task, many engines

**The feature:** you stop Claude Code halfway through a task, pick Codex, and
Codex carries on from where Claude stopped. No lost work, no restart, no
transcript dump.

**The tier:** V1.2. Single agent, sequential. **No parallel execution.**

Tier context: [V1](V1.md) · [LADDER](LADDER.md) · [ARCHITECTURE](ARCHITECTURE.md)
· next tier: [MVP](MVP.md)

---

## 1. The claim

The task does not belong to the engine. It belongs to Weave.

```
                        WEAVE TASK
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
         Ledger        Checkpoint      Worktree
      (what happened)  (where we are)  (what exists)
             └──────────────┼──────────────┘
                            ▼
                      Current worker
                            │
               ┌────────────┼────────────┐
               ▼            ▼            ▼
            Claude        Codex        Gemini
```

Stopping a worker kills a process. It must not kill a task.

```
Worker = dead
Task   = alive
```

Everything below is in service of that one line.

---

## 2. Where this stands today

Read this before writing anything. Three of the pieces exist, one is in the
wrong place, and one is actively wrong.

| Piece | State | Where |
|---|---|---|
| Append-only ledger, raw ACP verbatim | ✅ shipped | `core/ledger.ts`, `protocol/events.ts` |
| Engine switching, warm child pool | ✅ shipped | `agent/supervisor.ts` — `switchTo()` |
| Git evidence (`filesChanged` minus pre-dirty) | ✅ shipped | `core/git.ts`, `core/runner.ts:74` |
| Verification ladder, 8 rungs | ✅ shipped | `core/verify.ts`, `protocol/verification.ts` |
| `TaskState` · `HandoffContext` · `createCheckpoint` · `buildHandoffContext` | ⚠️ **written, imported by nothing** | `apps/desktop/src/agent/{execution,normalize}/` |
| `CheckpointBlock` UI + `continue_with_engine` action | ⚠️ **written, never dispatched** | `apps/desktop/src/agent/components/CheckpointBlock.tsx` |
| Carry-forward on engine switch | ❌ **wrong design, shipping** | `apps/desktop/server/index.ts:217` |

### The two problems with what exists

**Problem one: it is in `apps/desktop`.** `ARCHITECTURE.md §1` says
`protocol ← agent ← core ← cli`, and nothing points back. Checkpointing lives
inside the desktop app right now, which means:

- `weave resume --engine codex` cannot be written. There is no window.
- The eval harness cannot measure handoff quality. It never opens the UI.
- A crashed desktop process loses the checkpoint logic along with the window.

The types are good. The location is not. **V1.2 moves them down, it does not
rewrite them.**

**Problem two: `carryForwardDigest` is the design we are rejecting.** It keeps
the last 40 user/assistant turns as plain text and pastes them into the next
engine's first prompt inside `<prior-conversation>` tags. That is a transcript
dump. It is unbounded, it is prose, it contains no file list, no verification
result, no git anchor, and the receiving engine has no way to tell a decision
from a musing.

It ships today and it must be deleted in Slice 5 — not left alongside the new
path. Two carry-forward mechanisms means the one that fires is whichever the
call site happened to reach.

---

## 3. The rule that makes this work

Three kinds of thing end up in a checkpoint, and they are **not equally
trustworthy.** Rank them explicitly, or the whole feature becomes a rumour mill.

| Rank | Kind | Source | Can the next engine trust it? |
|---|---|---|---|
| 1 | **Filesystem + git** | `git status`, `git diff`, the files themselves | Yes. It is the thing itself. |
| 2 | **Ledger facts** | `events.ndjson` — tool calls, permissions, verification rungs, usage | Yes. Recorded as it happened, never rewritten. |
| 3 | **Model narrative** | "decisions", "discoveries", "what I was about to do" | **No. It is a claim.** |

Rank 3 is the useful part and the dangerous part. It is the only place
*intent* can come from — no diff tells you the engine chose cache-aside on
purpose. But it is authored by a model that was mid-thought when you killed it.

**So the rule:**

> Rank 3 may direct attention. It may never authorise skipping work.

"Redis integration is done" is a hint to go look at `redis.ts`. It is not
permission to leave `redis.ts` unread. The receiving engine's first instruction
is always: *verify the workspace before trusting this brief.*

The unwired `handoff.ts` already says this in a comment on line 12. Promote it
from a comment to the contract.

---

## 4. State is a fold over the ledger, not a thing you maintain

The obvious design is to keep a `TaskState` object in memory, mutate it as
events arrive, and serialise it at stop time. **Do not do that.**

It has one fatal property: if the process dies without running its stop path —
`SIGKILL`, an OOM, the laptop lid — the state dies with it. Those are exactly
the interruptions where continuation matters most.

Instead:

```
events.ndjson  ──fold──▶  TaskState  ──project──▶  Checkpoint  ──render──▶  Brief
   (truth)                (derived)                 (cached)                (text)
```

`foldTaskState(events)` is a **pure function**. No I/O, no clock, no
randomness. Same events in, same state out, forever.

That buys four things at once:

1. **Crash-proof.** The ledger is written with `appendFileSync` (`ledger.ts:47`,
   synchronous on purpose). Whatever reached disk can be folded. There is no
   "checkpoint we forgot to take" — only "a fold we have not run yet".
2. **Testable.** Record one real ledger, assert on the folded state. No agent,
   no network, no API key. This is the only way these tests run often.
3. **Replay for free.** `V3.2`'s `replay.ts` was already going to be a reader
   over the ledger. It becomes the same fold with a `seq` bound.
4. **Fixable retroactively.** Fold logic has a bug? Fix it and re-fold every
   ledger you have ever written. A mutated in-memory object gives you one shot.

A checkpoint is then just `{ seq, foldTaskState(events.slice(0, seq)) }` —
a cache with its cache key in the open.

**Consequence for the existing prototype:** `apps/desktop/src/agent/execution/reduceEvent.ts`
folds *UI* events. The new fold must consume `WeaveEvent` from
`protocol/events.ts` — the ledger union — and live in `core`. The UI keeps its
own reducer for rendering. Two folds, different jobs, no shared code.

---

## 5. On-disk layout

Today's runtime dir, unchanged:

```
.weave/
  .gitignore                        "*" — self-ignoring, already shipped
  runs/<runId>/events.ndjson        append-only, the truth
  conversations.json
  sessions.json
```

V1.2 adds one directory:

```
.weave/
  tasks/<taskId>/
    task.json                       identity · goal · status · attempts[]
    checkpoints/<seq>.json          immutable snapshots, named by ledger seq
    latest.json                     copy of the newest checkpoint
```

### Why tasks sit beside runs, not inside them

A run is one process lifetime. The desktop opens one `Ledger` per WebSocket
connection (`server/index.ts:200`); close the app and the next launch is a new
`runId`.

A task outlives that. Claude works on `T1` today, you quit, tomorrow Codex
finishes it. Two runs, one task. Nesting tasks under runs would put the
continuation you need at the bottom of a directory named after the session that
failed to finish it.

So: `attempts[]` in `task.json` points *out* at `(runId, seqStart, seqEnd)`
ranges. Many runs per task, and every attempt's evidence stays where it was
written.

### What is deliberately NOT a file

The natural instinct is a file per concern — `decisions.json`,
`discoveries.json`, `context.json`, `verification.json`. Resist it.

Every one of those is a fold over the same ledger. Give each its own file and
you get four things that can disagree, four write paths that can half-fail, and
no way to tell which is stale. One ledger, one fold, one snapshot format.

`diff.patch` is the single arguable exception, and V1.2 still says no: the
worktree is right there, and `git diff <baseCommit>` reproduces it exactly. A
stored patch is a copy that can rot.

### One bug to fix first

`Ledger.writeArtifact` (`core/ledger.ts:53`) uses `appendFileSync`. Write
`latest.json` twice and the file becomes two JSON documents nose to tail —
unparseable. Checkpoints rewrite `latest.json` constantly. Fix it to
`writeFileSync` before Slice 3, or the first two checkpoints of every task
corrupt the pointer.

---

## 6. The contracts

Types go in `packages/protocol/src/continuation.ts`. It is types only, zero
runtime deps — same as every other file in that package.

These are the shapes, not the implementations. **Write the bodies yourself;
that is where the thinking is.**

```ts
/** A unit of work that outlives any single engine, session, or process. */
export interface TaskRecord {
  schemaVersion: 1;
  id: string;
  /** The user's original request, verbatim. Never summarised, never rewritten. */
  goal: string;
  cwd: string;
  status: "running" | "paused" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  attempts: Attempt[];
  /** Filename under checkpoints/, or null before the first one. */
  latestCheckpoint: string | null;
}

/** One (engine, session) binding. A switch ends one attempt and starts another. */
export interface Attempt {
  index: number;
  engineId: string;
  sessionId: string;
  runId: string;
  seqStart: number;
  seqEnd?: number;
  endedBy?: CheckpointReason;
}
```

`TaskState` and `HandoffContext` already exist in
`apps/desktop/src/agent/normalize/types.ts:84` and `:113`. Move them here
mostly as-is, with these changes:

| Change | Why |
|---|---|
| Add `atSeq: number` | The fold's high-water mark. Without it a checkpoint cannot say what it saw. |
| Add `git: { branch, baseCommit, headCommit, dirty: string[] }` | Rank-1 evidence. The current shape has no git anchor at all. |
| Add `inFlight: ToolCallRef[]` | Tool calls that started and never completed — see §7. |
| Mark `decisions` / `discoveries` as `claimed: true` | Enforce §3 in the type, not in a comment. |
| Drop `errors[].fatal` | Nothing can set it honestly at fold time. Classification is `V3.2`'s supervisor. |

The fold and its consumers:

```ts
// core/state.ts — pure. No I/O, no Date.now(), no randomness.
export function foldTaskState(events: WeaveEvent[], goal: string): TaskState;

// core/checkpoint.ts
export function shouldCheckpoint(event: WeaveEvent, state: TaskState):
  { checkpoint: boolean; reason?: CheckpointReason };
export async function writeCheckpoint(
  weaveDir: string, taskId: string, state: TaskState, reason: CheckpointReason,
): Promise<Checkpoint>;
export async function readLatest(weaveDir: string, taskId: string): Promise<Checkpoint | null>;

// core/handoff.ts
export function buildBrief(checkpoint: Checkpoint, next: EngineDescriptor): string;
```

`shouldCheckpoint` already exists and its trigger list is right
(`execution/checkpoint.ts:19`). It takes `eventType: string`; make it take a
typed `WeaveEvent` on the way down to `core`.

---

## 7. The interrupted tool call

This is the part the transcript-dump design cannot do at all, and it is the
main reason the ledger earns its keep.

ACP emits `tool_call` then `tool_call_update` with a terminal status. Both land
in the ledger verbatim inside `agent.message` (`runner.ts:118` — "throwing the
original away is unrecoverable", and this is what that comment was for).

Kill the process between the two and the ledger shows:

```
seq 182  agent.message  tool_call         edit_file  apps/api/src/todos.ts
seq 183  agent.message  usage_update
                                          ← you hit Stop here
```

No completion. So the fold knows something the filesystem alone cannot tell
you: **`todos.ts` may be half-written.** A file that parses is not a file that
was finished.

```ts
interface ToolCallRef {
  toolCallId: string;
  title: string;
  kind: ToolKind;
  locations: string[];
  startedAtSeq: number;
}
```

Anything in `inFlight` goes into the brief under a heading the receiving engine
cannot miss:

```
UNFINISHED — verify before trusting
  apps/api/src/todos.ts   an edit was in progress when the previous
                          worker stopped. Read it before editing.
```

Same mechanism catches a killed `pnpm build` and a half-applied migration.

---

## 8. What Stop actually does

Today `cancel` is one line: `void supervisor.current.cancel()`
(`server/index.ts:370`). It fires and forgets. V1.2 makes it a sequence, and
the order matters.

```
1. supervisor.current.cancel()          ask the engine to stop the turn
2. drain, bounded — 2s                  late updates still reach the ledger
3. readGitStatus(cwd)                   rank-1 evidence, after the dust settles
4. foldTaskState(readLedger())          rank-2 evidence
5. writeCheckpoint(..., reason)         immutable, named by seq
6. task.status = "paused"               the task survives
7. emit checkpoint.created              the UI renders CheckpointBlock
```

**Step 2 is the one that gets skipped and shouldn't.** ACP cancellation is
cooperative. An engine mid-write finishes the write and then reports. Fold
before it lands and the checkpoint claims a file is unfinished that is
actually fine — the next engine redoes correct work. Two seconds, then proceed
regardless; a hung engine must not block the checkpoint.

**Step 3 after step 2, never before.** Git status taken during a live write
sees a partial file.

The reasons, unchanged from the prototype (`execution/checkpoint.ts:7`):

```
user_cancellation · provider_limit · agent_crash · timeout · max_turns
explicit_handoff · file_milestone · verification_milestone · test_milestone
```

The first six are terminal — always checkpoint. The last three are milestones:
checkpoint only when state actually moved, or an idle agent writes a checkpoint
per heartbeat. **Never checkpoint per token.**

---

## 9. What the next engine receives

Not the transcript. A bounded brief, assembled from the checkpoint.

```
TASK
Build a Todo API for this project.
(the user's original words — not a summary)

WORKSPACE
branch weave/T1 · base abc123f · 5 files changed, uncommitted
The previous worker's changes are already on disk. Do not recreate them.

CHANGED
  apps/api/src/server.ts
  packages/db/schema.prisma
  apps/api/src/redis.ts

VERIFIED  (deterministic — these actually ran)
  typecheck   passed   rung 3
  build       passed   rung 4
  tests       —        no suite in this project

UNFINISHED — verify before trusting
  apps/api/src/todos.ts   edit in progress when the previous worker stopped

CLAIMED BY THE PREVIOUS WORKER  (unverified — treat as hints)
  "Using Prisma with PostgreSQL"
  "Redis cache-aside, not write-through"
  "Project is a pnpm monorepo"

WAS DOING
  Implementing POST /todos

FIRST INSTRUCTION
Read the changed files before editing them. The filesystem is authoritative;
everything under CLAIMED is a hint from a worker that was interrupted.
```

### The three properties that matter

**Bounded.** Hard cap — 4 KB, or ~1000 tokens. `carryForwardDigest` has no cap
at all; 40 turns of a long session is tens of thousands of tokens spent before
the new engine does anything. When over budget, drop in this order: claims
first, then older completed steps, then commands. **Never** drop the goal, the
changed-file list, or `UNFINISHED`.

**Sectioned by trust.** `VERIFIED` and `CLAIMED` are different headings because
they have different epistemic status (§3). A prose blob flattens that
distinction and the receiving model cannot recover it.

**Reproducible.** `buildBrief` is pure. Same checkpoint, same string. It is
diffable in a test, which is the only reason anyone will keep it honest.

---

## 10. Build slices

Seven. Each ends somewhere you could stop.

### Slice 1 — Task identity

`protocol/continuation.ts` · `core/tasks-store.ts`

A task exists, has an id, survives a stop, and knows its attempts. Model it on
`ConversationStore` (`core/conversations-store.ts`) — same shape, same
whole-file-rewrite discipline.

New ledger events, and only these three:

```ts
| { type: "attempt.started"; taskId; attemptIndex; engineId; sessionId }
| { type: "attempt.ended";   taskId; attemptIndex; endedBy: CheckpointReason }
| { type: "checkpoint.created"; taskId; checkpointId; atSeq; reason }
```

Resist adding more. Everything else you want is already derivable from
`agent.message`, and every new event type is a fold branch forever.

**Done when:** stop the desktop mid-turn, relaunch, and `task.json` still says
`paused` with one attempt recorded.

### Slice 2 — The fold

`core/state.ts`

`foldTaskState(events, goal) → TaskState`. Pure. This is the slice with the
actual thinking in it — how do you get `completed[]`, `inProgress`, and
`inFlight[]` out of a stream of raw ACP payloads?

**Design this before writing it.** Specifically:

- Which ACP updates mean "a step finished"? There is no `step_completed` in
  ACP — you are inventing the mapping.
- `inFlight` needs `tool_call` ids matched against `tool_call_update` terminal
  statuses. What is the data structure, and what happens to an id you see
  completed but never started (a replayed session)?
- `decisions` and `discoveries` cannot be folded from tool calls at all. Where
  do they come from? (See §12 — this is an open question, not a solved one.)

**Done when:** fold a recorded ledger from a real run, and the state matches
what you know happened. Fixture-backed, no agent, no API key.

### Slice 3 — Checkpoints

`core/checkpoint.ts`

Fix `writeArtifact` first (§5). Then: trigger rules, immutable write named by
`seq`, `latest.json` pointer, read back.

Move `shouldCheckpoint` down from `apps/desktop/src/agent/execution/checkpoint.ts`
and **delete the original.** A copy left behind is the next bug.

**Done when:** a completed run leaves a checkpoint chain, and the last one folds
to the same state as re-folding the whole ledger.

### Slice 4 — Stop, properly

`apps/desktop/server/index.ts` · `packages/cli`

The seven-step sequence from §8, replacing the fire-and-forget `cancel`.

**Done when:** `weave runs` shows a stopped task as `paused` with a checkpoint,
and killing the process with `SIGKILL` — no stop path at all — still leaves a
foldable ledger you can checkpoint from on next launch.

That second half is the real test. Slice 2's purity is what makes it pass.

### Slice 5 — The brief

`core/handoff.ts` · **delete `carryForwardDigest`**

Move `buildHandoffContext` down. Add the trust sections, the budget, the
ordered drop list.

Then delete `carryForwardDigest` and `transcript[]` from `server/index.ts:207-229`
and point `switch-engine`'s `pendingPreamble` at `buildBrief`. Both mechanisms
in the tree at once is worse than either alone.

**Done when:** switching engine mid-task injects a brief under 4 KB, and the
transcript digest is gone from the codebase.

### Slice 6 — Resume

`packages/cli` · `apps/desktop`

```bash
weave resume <taskId> --engine codex
```

Loads the checkpoint, builds the brief, opens a session on the named engine,
records `attempt.started`, prompts. `supervisor.switchTo()` already does the
engine half (`agent/supervisor.ts:89`).

Desktop: wire `CheckpointBlock` — the component exists
(`components/CheckpointBlock.tsx`), the action exists
(`continue_with_engine`, `normalize/types.ts:398`), nothing dispatches it.

**CLI before UI, deliberately.** If resume only works through a window it
cannot be evaluated, and Slice 7 has nothing to measure.

**Done when:** start with Claude, stop, `weave resume --engine codex`, and Codex
edits the existing files instead of recreating them.

### Slice 7 — The gate

`packages/eval`

Everything above is unfalsifiable without this. Add a handoff fixture family:
run to a fixed interrupt point with engine A, hand off to B, verify with the
ladder.

Three arms, same fixture, same rung:

| Arm | Meaning |
|---|---|
| A alone, uninterrupted | The baseline |
| A → stop → A | Does continuation itself cost anything? |
| A → stop → B | Does *cross-engine* continuation cost anything? |

Two numbers:

- **Pass rate by rung**, per arm. Never averaged across rungs
  (`verification.ts:22`).
- **Redundant work rate** — files the second worker rewrote to a
  byte-identical result. That is the brief failing to communicate, measured
  rather than argued.

**Done when:** the matrix reports all three arms, and you can say what handoff
costs in a number.

---

## 11. Provider limits — the payoff

The screenshot case. `useModelQuota.ts:41` already carries the text: *"You've
hit your monthly spend limit."*

Today that is where a task dies. It should be where a checkpoint happens:

```
provider limit
      ↓
checkpoint (reason: provider_limit)
      ↓
mark engine unavailable
      ↓
offer the alternatives
      ↓
resume on the chosen one
```

**Manual for V1.2.** Automatic failover means the router picking an engine
without asking, and you have no data yet on whether cross-engine handoff even
holds up — that is exactly what Slice 7 measures. Routing on measured
statistics is `V3.1`. Do not front-run it with a guess.

One caveat worth naming: `engines-registry.ts:23` gives every engine
`FULL_CAPABILITIES`, including `resume: true` and `handoff: true`. Those are
declarations, not measurements — and [FINDINGS](FINDINGS.md) records that codex
and gemini have never completed a real task here. **Slice 7 is what turns those
booleans into facts.** Until then a "Continue with…" list built from
`capabilities.handoff` is offering something unproven.

---

## 12. What you have to decide

Three real forks. The doc does not settle them, because the answers change the
build.

**A. Where do `decisions` and `discoveries` come from?**
Nothing in ACP emits them. Three options, and they are not equal:

| Option | Cost | Risk |
|---|---|---|
| Ask the engine, mid-run, for structured state | Tokens on every checkpoint | Interrupts the work |
| One summarisation call at stop time | One call, ~2s added to Stop | The engine is already dying — provider limit means this call fails too |
| Derive nothing; ship rank 1+2 only | Free | The brief loses all intent |

Pick one and defend it. Consider what happens to each when the reason is
`provider_limit`.

**B. Does V1.2 use a worktree or the project dir?**
Worktrees are MVP.1's (`core/worktree.ts`). Working in place is what ships
today. Working in place is the smaller change — but then `baseCommit` is
whatever HEAD was, and an uncommitted user change is indistinguishable from an
agent change.

The checkpoint's `git` block has the same shape either way, so this is
reversible. Which means: pick the cheap one unless you can name what breaks.

**C. Is a task the same thing as a conversation?**
`ConversationStore` already exists. Is `taskId` a new identity, or is a
conversation a task with a nicer name? One user request can spawn several
tasks; one task can span several conversations. Deciding they are the same is
simpler now and possibly wrong at MVP.2, when the planner emits many tasks from
one prompt.

---

## 13. Exit criteria

Four. All mechanical.

1. **`weave resume <taskId> --engine <other>` continues a real task from the
   CLI**, with no window open, and the second engine edits existing files rather
   than recreating them.
2. **`SIGKILL` mid-turn loses nothing.** Next launch folds the ledger, writes a
   checkpoint, and offers to continue. No stop path ran.
3. **The brief is under 4 KB** on a task with 40+ turns, and contains the goal,
   the changed files, and the unfinished tool calls.
4. **The three-arm matrix reports pass rate by rung and redundant work rate**,
   across ≥6 fixtures × ≥3 repeats.

Criterion 2 is the one that separates this from a transcript dump. Criterion 4
is the one that makes any of it a claim rather than a hope.

---

## 14. What V1.2 deliberately does not do

**No parallel execution.** One worker at a time, start to finish. No pool, no
scheduler, no ownership map, no leases, no fencing tokens. Every one of those is
coordination *between* workers, and there is exactly one worker.

The design still has to survive MVP.1 without a rewrite, and the thing that
buys that is `taskId` on every event and `attempts[]` on the task. When workers
become concurrent, an attempt gains a `workerId` and nothing else in this
document changes shape.

**No automatic failover.** §11. Manual until measured.

**No RAG, no vector index, no code graph.** The receiving engine has the
filesystem and can read it. Retrieval quality is `V2.2`'s problem
(`core/context/`), and adding it here would make a continuation failure
impossible to attribute — was it the brief, or was it retrieval?

**No failure classification.** `RECOVERABLE` vs `RETRY` vs `REPLAN` is the
supervisor's taxonomy at `V3.2`. V1.2 records *that* a task stopped and *what
the reason string was*. It does not decide what to do about it. That is a human
clicking a button, and for one worker on one machine that is not a limitation.

**No merge, no integration.** One worktree, one lineage, no conflicts. The
integrator is MVP.1.

---

## 15. Renegotiating V3.2

[LADDER](LADDER.md) lists `checkpoint.ts` under V3.2, next to `supervisor.ts`,
`policy.ts` and `replay.ts`. V1.2 takes the checkpoint file early, which is a
change to the plan and should be recorded as one.

| Was V3.2 | Now |
|---|---|
| `checkpoint.ts` — snapshot to resume a task | **V1.2.** A single agent needs it the moment you can stop it. |
| `replay.ts` — reader over the ledger | **Mostly V1.2.** It is `foldTaskState` with a `seq` bound. V3.2 keeps the CLI surface. |
| `supervisor.ts` — the failure taxonomy | **Stays V3.2.** Needs multiple workers and unattended runs to mean anything. |
| `policy.ts` — auto/approve/deny by risk | **Stays V3.2.** Orthogonal. |

The reason for pulling it forward is not impatience. Checkpointing was filed
under V3.2 because that is where *unattended recovery* lives — but the
interruption that motivates it is a human pressing Stop, and that exists at
V1.0. The feature was mis-filed against its own trigger.
